use base64::{engine::general_purpose, Engine};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, time::Instant};
use tauri_plugin_shell::ShellExt;
use thiserror::Error;

use crate::get_app_handle;

#[derive(serde::Serialize, Clone)]
pub struct VideoMetadata {
    file_path: String,
    resolution: String,
    frame_rate: String,
    duration: String,
    bit_rate: String,
    file_size: String,
    file_hash: String,
    thumbnails_base64: Vec<String>, // Store base64 encoding of 4 thumbnails
}

#[derive(Error, Debug)]
pub enum Error {
    #[error("Failed to execute ffmpeg: {0}")]
    FFmpegError(String),
    #[error("Failed to parse ffmpeg output: {0}")]
    ParseError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Shell error: {0}")]
    ShellError(#[from] tauri_plugin_shell::Error),
}

#[tauri::command]
pub async fn get_video_metadata(path: String) -> Result<VideoMetadata, String> {
    let start_time = Instant::now();

    tracing::info!(
        video_path = %path,
        event = "processing_start",
        "Starting video metadata extraction"
    );

    let result = extract_video_metadata_async(&path).await;

    let total_duration = start_time.elapsed().as_millis() as u64;

    match &result {
        Ok(_) => {
            tracing::info!(
                video_path = %path,
                event = "processing_success",
                duration_ms = total_duration,
                "Video metadata extraction completed successfully"
            );
        }
        Err(e) => {
            tracing::error!(
                video_path = %path,
                event = "processing_error",
                error = %e,
                duration_ms = total_duration,
                "Video metadata extraction failed"
            );
        }
    }

    result.map_err(|e| e.to_string())
}

/// Extract video metadata using ffmpeg sidecar
async fn extract_video_metadata_async(path: &str) -> Result<VideoMetadata, Error> {
    let app_handle = get_app_handle()
        .ok_or_else(|| Error::FFmpegError("App handle not available".to_string()))?;

    // Get metadata using ffprobe (part of ffmpeg)
    let metadata = get_video_info_with_ffprobe(app_handle, path).await?;

    // Calculate file size and hash
    let file_size = get_file_size(path)?;
    let file_hash = calculate_file_hash(path)?;

    // Generate 4 thumbnails
    let thumbnails_base64 = generate_thumbnails_with_ffmpeg(app_handle, path, &metadata).await?;

    Ok(VideoMetadata {
        file_path: path.to_string(),
        resolution: format!("{}x{}", metadata.width, metadata.height),
        frame_rate: format!("{:.2}", metadata.frame_rate),
        duration: format!("{:.2}s", metadata.duration),
        bit_rate: format!("{:.2} kbps", metadata.bit_rate / 1024.0),
        file_size,
        file_hash,
        thumbnails_base64,
    })
}

#[derive(Debug)]
struct VideoInfo {
    width: u32,
    height: u32,
    duration: f64,
    frame_rate: f64,
    bit_rate: f64,
}

/// Get video information using ffprobe sidecar
async fn get_video_info_with_ffprobe(
    app_handle: &tauri::AppHandle,
    path: &str,
) -> Result<VideoInfo, Error> {
    tracing::debug!(video_path = %path, "Getting video info with ffprobe");

    let shell = app_handle.shell();

    let start = Instant::now();
    // Use ffprobe to get video metadata in JSON format
    let output = shell
        .sidecar("ffprobe")?
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-select_streams",
            "v:0",
            path,
        ])
        .output()
        .await
        .map_err(|e| Error::FFmpegError(format!("Failed to execute ffprobe: {}", e)))?;

    let elapsed = start.elapsed();

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Error::FFmpegError(format!("ffprobe failed: {}", stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    tracing::debug!(
        video_path = %path,
        ffprobe_output = %stdout,
        elapsed = ?elapsed,
        "FFprobe JSON output"
    );

    // Parse the JSON output
    let json: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| Error::ParseError(format!("Failed to parse ffprobe JSON: {}", e)))?;

    // Extract video stream information
    let streams = json["streams"]
        .as_array()
        .ok_or_else(|| Error::ParseError("No streams found in ffprobe output".to_string()))?;

    let video_stream = streams
        .iter()
        .find(|stream| stream["codec_type"].as_str() == Some("video"))
        .ok_or_else(|| Error::ParseError("No video stream found".to_string()))?;

    // Extract metadata
    let width = video_stream["width"]
        .as_u64()
        .ok_or_else(|| Error::ParseError("Width not found".to_string()))? as u32;

    let height = video_stream["height"]
        .as_u64()
        .ok_or_else(|| Error::ParseError("Height not found".to_string()))? as u32;

    // Parse frame rate (can be a fraction like "30/1")
    let frame_rate_str = video_stream["r_frame_rate"]
        .as_str()
        .ok_or_else(|| Error::ParseError("Frame rate not found".to_string()))?;
    let frame_rate = parse_fraction(frame_rate_str)?;

    // Parse duration from format section
    let format = &json["format"];
    let duration_str = format["duration"]
        .as_str()
        .ok_or_else(|| Error::ParseError("Duration not found".to_string()))?;
    let duration: f64 = duration_str
        .parse()
        .map_err(|_| Error::ParseError("Invalid duration format".to_string()))?;

    // Parse bit rate
    let bit_rate_str = format["bit_rate"].as_str().unwrap_or("0");
    let bit_rate: f64 = bit_rate_str.parse().unwrap_or(0.0);

    tracing::debug!(
        video_path = %path,
        width = width,
        height = height,
        duration = duration,
        frame_rate = frame_rate,
        bit_rate = bit_rate,
        "Successfully extracted video metadata"
    );

    Ok(VideoInfo {
        width,
        height,
        duration,
        frame_rate,
        bit_rate,
    })
}

/// Number of thumbnails to extract, evenly distributed across the video.
const THUMBNAIL_COUNT: usize = 4;

/// Generate thumbnails using the ffmpeg sidecar.
///
/// Thumbnails are extracted concurrently, then re-ordered by their timeline
/// position so they always render left-to-right (10% → 90%) regardless of
/// which extraction finishes first. Individual failures are logged and skipped
/// rather than aborting the whole extraction — the rest of the metadata is
/// already available and worth showing.
async fn generate_thumbnails_with_ffmpeg(
    app_handle: &tauri::AppHandle,
    path: &str,
    video_info: &VideoInfo,
) -> Result<Vec<String>, Error> {
    tracing::debug!(
        video_path = %path,
        "Generating {} thumbnails with ffmpeg",
        THUMBNAIL_COUNT
    );

    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| Error::FFmpegError(format!("System time error: {}", e)))?
        .as_nanos();

    // Ensure temp directory exists
    std::fs::create_dir_all(&temp_dir)?;

    // Evenly distributed time points across the video duration
    let duration = video_info.duration;
    let time_points: [f64; THUMBNAIL_COUNT] = [
        duration * 0.1, // 10% into the video
        duration * 0.3, // 30% into the video
        duration * 0.6, // 60% into the video
        duration * 0.9, // 90% into the video
    ];

    let start = Instant::now();

    let mut tasks = Vec::with_capacity(THUMBNAIL_COUNT);
    for (index, &time_point) in time_points.iter().enumerate() {
        let app_handle = app_handle.clone();
        let path = path.to_string();
        let temp_dir = temp_dir.clone();
        tasks.push(tauri::async_runtime::spawn(async move {
            let thumbnail =
                extract_thumbnail_at(app_handle, path, temp_dir, timestamp, index, time_point)
                    .await?;
            Ok::<(usize, String), Error>((index, thumbnail))
        }));
    }

    // Collect results and sort by timeline index so order is deterministic.
    let mut results: Vec<(usize, String)> = Vec::with_capacity(THUMBNAIL_COUNT);
    let mut failures = 0usize;
    for task in tasks {
        match task.await {
            Ok(Ok(pair)) => results.push(pair),
            Ok(Err(e)) => {
                failures += 1;
                tracing::warn!(error = %e, "Thumbnail generation failed, skipping");
            }
            Err(e) => {
                failures += 1;
                tracing::warn!(error = %e, "Thumbnail task panicked, skipping");
            }
        }
    }
    results.sort_by_key(|(index, _)| *index);

    let elapsed = start.elapsed();
    tracing::debug!(
        video_path = %path,
        thumbnails_count = results.len(),
        failures = failures,
        elapsed = ?elapsed,
        "Thumbnail generation complete"
    );

    Ok(results.into_iter().map(|(_, thumbnail)| thumbnail).collect())
}

/// Extract a single thumbnail at `time_point` and return it as a base64 data URI.
async fn extract_thumbnail_at(
    app_handle: tauri::AppHandle,
    path: String,
    temp_dir: std::path::PathBuf,
    timestamp: u128,
    index: usize,
    time_point: f64,
) -> Result<String, Error> {
    let temp_image_path = temp_dir.join(format!("thumbnail_{}_{}.png", timestamp, index));
    let temp_image_path_string = temp_image_path
        .to_str()
        .ok_or_else(|| Error::FFmpegError("Thumbnail temp path is not valid UTF-8".to_string()))?
        .to_string();

    // Seek to the time point, grab one frame, downscale for a compact thumbnail.
    let output = app_handle
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| Error::FFmpegError(format!("Failed to execute ffmpeg: {}", e)))?
        .args([
            "-ss",
            &format!("{:.2}", time_point),
            "-i",
            &path,
            "-vframes",
            "1",
            "-vf",
            "scale=480:270:force_original_aspect_ratio=decrease",
            "-q:v",
            "2",
            "-f",
            "image2",
            "-y",
            &temp_image_path_string,
        ])
        .output()
        .await
        .map_err(|e| Error::FFmpegError(format!("Failed to execute ffmpeg: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = fs::remove_file(&temp_image_path);
        return Err(Error::FFmpegError(format!(
            "ffmpeg thumbnail generation failed at time {:.2}s: {}",
            time_point, stderr
        )));
    }

    // Read the generated image, encode to base64, then clean up the temp file.
    let image_data = fs::read(&temp_image_path)?;
    let _ = fs::remove_file(&temp_image_path);
    let thumbnail_base64 = general_purpose::STANDARD.encode(&image_data);
    Ok(format!("data:image/png;base64,{}", thumbnail_base64))
}

/// Parse a fraction string like "30/1" to a float
fn parse_fraction(fraction_str: &str) -> Result<f64, Error> {
    let parts: Vec<&str> = fraction_str.split('/').collect();
    if parts.len() != 2 {
        return Err(Error::ParseError(format!(
            "Invalid fraction format: {}",
            fraction_str
        )));
    }

    let numerator: f64 = parts[0]
        .parse()
        .map_err(|_| Error::ParseError(format!("Invalid numerator: {}", parts[0])))?;
    let denominator: f64 = parts[1]
        .parse()
        .map_err(|_| Error::ParseError(format!("Invalid denominator: {}", parts[1])))?;

    if denominator == 0.0 {
        return Err(Error::ParseError(
            "Division by zero in fraction".to_string(),
        ));
    }

    Ok(numerator / denominator)
}

/// Get file size in human readable format
fn get_file_size(path: &str) -> Result<String, Error> {
    let metadata = fs::metadata(path)?;
    let size_bytes = metadata.len();

    if size_bytes < 1024 {
        Ok(format!("{} B", size_bytes))
    } else if size_bytes < 1024 * 1024 {
        Ok(format!("{:.2} KB", size_bytes as f64 / 1024.0))
    } else if size_bytes < 1024 * 1024 * 1024 {
        Ok(format!("{:.2} MB", size_bytes as f64 / (1024.0 * 1024.0)))
    } else {
        Ok(format!(
            "{:.2} GB",
            size_bytes as f64 / (1024.0 * 1024.0 * 1024.0)
        ))
    }
}

/// Calculate the SHA256 hash of a file.
///
/// The file is read in fixed-size chunks rather than loaded into memory in
/// full, so multi-gigabyte videos don't exhaust the process heap.
fn calculate_file_hash(path: &str) -> Result<String, Error> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

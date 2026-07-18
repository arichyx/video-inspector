use tracing_subscriber::{
    fmt::{self, time::LocalTime},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter, Layer,
};

/// Initialize the logging system for the video inspector application.
///
/// Console output only, defaulting to INFO (overridable via `RUST_LOG`).
pub fn init_logging() -> Result<(), Box<dyn std::error::Error>> {
    let timer = LocalTime::new(time::format_description::parse(
        "[year]-[month]-[day] [hour]:[minute]:[second].[subsecond digits:3]",
    )?);

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,video_inspector=debug"));

    let console_layer = fmt::layer()
        .with_timer(timer)
        .with_target(false)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_file(false)
        .with_line_number(false)
        .with_ansi(true)
        .with_filter(env_filter);

    tracing_subscriber::registry()
        .with(console_layer)
        .init();

    tracing::info!("Logging system initialized with console output");

    Ok(())
}

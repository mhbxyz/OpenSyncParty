use std::time::{SystemTime, UNIX_EPOCH};

/// Returns the current time in milliseconds since UNIX epoch.
/// Uses saturating arithmetic to handle clock drift gracefully (fixes L01).
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()  // Returns Duration::ZERO if clock went backwards
        .as_millis() as u64
}

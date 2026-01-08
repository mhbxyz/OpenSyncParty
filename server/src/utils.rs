use std::time::{SystemTime, UNIX_EPOCH};

/// Returns the current time in milliseconds since UNIX epoch.
/// Uses saturating arithmetic to handle clock drift gracefully (fixes L01).
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()  // Returns Duration::ZERO if clock went backwards
        .as_millis() as u64
}

/// Maximum allowed room name length
const MAX_ROOM_NAME_LENGTH: usize = 50;

/// Sanitizes a room name by:
/// - Trimming whitespace
/// - Removing control characters
/// - Limiting length
/// - Providing a default if empty (fixes L08)
pub fn sanitize_room_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .filter(|c| !c.is_control())  // Remove control characters
        .take(MAX_ROOM_NAME_LENGTH)    // Limit length
        .collect();

    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        "New Room".to_string()
    } else {
        trimmed.to_string()
    }
}

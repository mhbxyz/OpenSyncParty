use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,        // User ID
    pub name: String,       // Username
    pub aud: String,        // Audience (should be "OpenWatchParty")
    pub iss: String,        // Issuer (should be "Jellyfin")
    pub exp: usize,         // Expiration time
    pub iat: usize,         // Issued at
}

#[derive(Clone)]
pub struct JwtConfig {
    pub secret: String,
    pub audience: String,
    pub issuer: String,
    pub enabled: bool,
}

impl JwtConfig {
    pub fn from_env() -> Self {
        let secret = std::env::var("JWT_SECRET").unwrap_or_default();
        let enabled = !secret.is_empty();

        if !enabled {
            log::warn!("JWT_SECRET not set, authentication DISABLED");
        } else {
            // Validate secret quality (fixes L04, L15)
            // Note: We don't log exact lengths to avoid information leakage
            if secret.len() < 32 {
                log::warn!("JWT_SECRET is too short. Use at least 32 characters for secure authentication.");
            }
            // Check for low entropy (e.g., all same character)
            let unique_chars: std::collections::HashSet<char> = secret.chars().collect();
            if unique_chars.len() < 10 {
                log::warn!("JWT_SECRET has low entropy. Use a more random secret with diverse characters.");
            }
        }

        Self {
            secret,
            audience: std::env::var("JWT_AUDIENCE").unwrap_or_else(|_| "OpenWatchParty".to_string()),
            issuer: std::env::var("JWT_ISSUER").unwrap_or_else(|_| "Jellyfin".to_string()),
            enabled,
        }
    }

    pub fn validate_token(&self, token: &str) -> Result<Claims, String> {
        if !self.enabled {
            // Return a dummy claim when auth is disabled
            return Ok(Claims {
                sub: "anonymous".to_string(),
                name: "Anonymous".to_string(),
                aud: self.audience.clone(),
                iss: self.issuer.clone(),
                exp: 0,
                iat: 0,
            });
        }

        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_audience(&[&self.audience]);
        validation.set_issuer(&[&self.issuer]);
        validation.validate_exp = true;  // Enforce expiration check
        validation.leeway = 60;  // 60 seconds tolerance for clock skew

        match decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &validation,
        ) {
            Ok(token_data) => Ok(token_data.claims),
            Err(e) => Err(format!("Invalid token: {}", e)),
        }
    }
}

mod auth;
mod messaging;
mod room;
mod types;
mod utils;
mod ws;

use std::sync::Arc;
use warp::Filter;
use crate::auth::JwtConfig;
use crate::types::{Clients, Rooms};

fn get_allowed_origins() -> Vec<String> {
    std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:8096,https://localhost:8096".to_string())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn is_origin_allowed(origin: &str, allowed: &[String]) -> bool {
    if allowed.iter().any(|o| o == "*") {
        return true;
    }
    allowed.iter().any(|o| o == origin)
}

#[tokio::main]
async fn main() {
    let jwt_config = Arc::new(JwtConfig::from_env());
    let allowed_origins = get_allowed_origins();

    println!("[server] Allowed origins: {:?}", allowed_origins);
    println!("[server] JWT authentication: {}", if jwt_config.enabled { "ENABLED" } else { "DISABLED" });

    let clients: Clients = Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new()));
    let rooms: Rooms = Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new()));

    let clients_filter = warp::any().map(move || clients.clone());
    let rooms_filter = warp::any().map(move || rooms.clone());
    let jwt_filter = {
        let config = jwt_config.clone();
        warp::any().map(move || config.clone())
    };

    let allowed_origins_filter = {
        let origins = allowed_origins.clone();
        warp::any().map(move || origins.clone())
    };

    // Origin validation filter
    let origin_check = warp::header::optional::<String>("origin")
        .and(allowed_origins_filter.clone())
        .and_then(|origin: Option<String>, allowed: Vec<String>| async move {
            match origin {
                Some(ref o) if is_origin_allowed(o, &allowed) => Ok(()),
                Some(o) => {
                    eprintln!("[server] Rejected connection from origin: {}", o);
                    Err(warp::reject::custom(OriginRejected))
                }
                None => Ok(()), // Allow connections without Origin header (non-browser clients)
            }
        })
        .untuple_one();

    // Token query parameter
    #[derive(Debug, serde::Deserialize)]
    struct WsQuery {
        token: Option<String>,
    }

    // JWT validation filter
    let auth_check = warp::query::<WsQuery>()
        .and(jwt_filter.clone())
        .and_then(|query: WsQuery, jwt_config: Arc<JwtConfig>| async move {
            if !jwt_config.enabled {
                // Auth disabled, allow all connections
                return Ok(auth::Claims {
                    sub: "anonymous".to_string(),
                    name: "Anonymous".to_string(),
                    aud: "OpenSyncParty".to_string(),
                    iss: "Jellyfin".to_string(),
                    exp: 0,
                    iat: 0,
                });
            }

            match query.token {
                Some(token) => {
                    match jwt_config.validate_token(&token) {
                        Ok(claims) => Ok(claims),
                        Err(e) => {
                            eprintln!("[server] JWT validation failed: {}", e);
                            Err(warp::reject::custom(AuthRejected))
                        }
                    }
                }
                None => {
                    eprintln!("[server] Missing token in WebSocket connection");
                    Err(warp::reject::custom(AuthRejected))
                }
            }
        });

    // WebSocket route with Origin and Auth validation
    let ws_route = warp::path("ws")
        .and(origin_check)
        .and(auth_check)
        .and(warp::ws())
        .and(clients_filter)
        .and(rooms_filter)
        .map(|claims: auth::Claims, ws: warp::ws::Ws, clients, rooms| {
            ws.on_upgrade(move |socket| ws::client_connection(socket, clients, rooms, claims))
        });

    // Health check endpoint with CORS
    let cors = warp::cors()
        .allow_origins(allowed_origins.iter().map(|s| s.as_str()).collect::<Vec<_>>())
        .allow_methods(vec!["GET"])
        .allow_headers(vec!["content-type"]);

    let health_route = warp::path("health")
        .and(warp::get())
        .and(jwt_filter.clone())
        .map(|jwt_config: Arc<JwtConfig>| {
            warp::reply::json(&serde_json::json!({
                "status": "ok",
                "auth_enabled": jwt_config.enabled
            }))
        })
        .with(cors);

    let routes = ws_route.or(health_route);

    println!("OpenSyncParty Rust Server running on 0.0.0.0:3000");
    warp::serve(routes).run(([0, 0, 0, 0], 3000)).await;
}

#[derive(Debug)]
struct OriginRejected;
impl warp::reject::Reject for OriginRejected {}

#[derive(Debug)]
struct AuthRejected;
impl warp::reject::Reject for AuthRejected {}

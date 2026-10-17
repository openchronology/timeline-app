// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The desktop app's server connections: up to eight servers, signing in to them by device login,
// API requests to them for the editor, and opening image links in the browser.
use reqwest::{Client, Method, Url};
use serde::Serialize;
use serde_json::{json, Value};
use std::{sync::Mutex, time::Duration};
// A pull-request reply includes two snapshots, each within the 16 MiB request limit.
const LIMIT: usize = 40 * 1024 * 1024;
#[derive(Default)]
struct Credentials {
    token: Option<String>,
    login_cookie: Option<String>,
    device_code: Option<String>,
}
/** One server the desktop is connected to, signed in or not. */
struct Connection {
    origin: Url,
    credentials: Credentials,
    /** Changes whenever the connection's credentials do, so stale replies are dropped. */
    generation: u64,
}
/** At most this many servers at once. */
pub const SERVERS: usize = 8;
struct State {
    /** The connected servers, the one in use first. */
    connections: Vec<Connection>,
    /** The last generation handed out, across every connection. */
    generation: u64,
}
impl State {
    fn find(&self, origin: &Url) -> Option<usize> {
        self.connections
            .iter()
            .position(|c| c.origin.origin() == origin.origin())
    }
    fn connection(&mut self, origin: &Url) -> Result<&mut Connection, String> {
        let index = self.find(origin).ok_or("Connect to this server first")?;
        Ok(&mut self.connections[index])
    }
    fn next(&mut self) -> u64 {
        self.generation += 1;
        self.generation
    }
}
fn device_destination(target: &Url, configured: &Url, code: &str) -> bool {
    code.len() == 10
        && code
            .bytes()
            .all(|c| c.is_ascii_uppercase() || (b'2'..=b'9').contains(&c))
        && target.origin() == configured.origin()
        && target.username().is_empty()
        && target.password().is_none()
        && target.query().is_none()
        && ((target.path() == format!("/connect/desktop/{code}") && target.fragment().is_none())
            || (target.path() == "/" && target.fragment() == Some(&format!("desktop/{code}"))))
}
fn capture_token(body: &mut Value, credentials: &mut Credentials) -> Result<(), String> {
    if let Some(token) = body.as_object_mut().and_then(|o| o.remove("token")) {
        let value = token.as_str().ok_or("Invalid session credential")?;
        if value.len() != 64
            || !value
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return Err("Invalid session credential".into());
        }
        credentials.token = Some(value.into());
        credentials.login_cookie = None;
        credentials.device_code = None;
    }
    Ok(())
}
pub struct Server {
    client: Client,
    state: Mutex<State>,
}
#[derive(Serialize)]
pub struct Reply {
    pub status: u16,
    pub body: Value,
}
pub fn origin(text: &str) -> Result<Url, String> {
    let url = Url::parse(text).map_err(|_| "Enter an HTTPS server origin")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (url.scheme() != "https" && !(local && url.scheme() == "http"))
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Use an HTTPS origin without a path or credentials (HTTP is allowed only on loopback)"
                .into(),
        );
    }
    Ok(url)
}
fn api_path(path: &str) -> Result<(), String> {
    if path.is_empty()
        || path.len() > 256
        || !path
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"/-".contains(&c))
        || path.contains("//")
        || !(path == "session"
            || path.starts_with("auth/")
            || path == "plugins"
            || path.starts_with("plugins/")
            || path == "timelines"
            || path.starts_with("timelines/"))
    {
        return Err("Invalid server API path".into());
    }
    Ok(())
}
impl Server {
    pub fn new() -> Result<Self, String> {
        origin(Self::default_origin())?;
        Ok(Self {
            client: Client::builder()
                .https_only(false)
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(30))
                .connect_timeout(Duration::from_secs(10))
                .user_agent("OpenChronology-Desktop/0.1")
                .build()
                .map_err(|e| e.to_string())?,
            state: Mutex::new(State {
                connections: Vec::new(),
                generation: 0,
            }),
        })
    }
    /** The server a new installation connects to. */
    pub fn default_origin() -> &'static str {
        option_env!("OPENCHRONOLOGY_SERVER_ORIGIN")
            .filter(|s| !s.is_empty())
            .unwrap_or("https://timescale.info")
    }
    /** The connected servers' origins, the one in use first. */
    pub fn servers(&self) -> Result<Vec<String>, String> {
        Ok(self
            .state
            .lock()
            .map_err(|e| e.to_string())?
            .connections
            .iter()
            .map(|c| c.origin.origin().ascii_serialization())
            .collect())
    }
    /**
     * Connects to a server, keeping the others and their sign-ins, and puts it first (in
     * use). Connecting to a server again keeps its sign-in.
     */
    pub fn connect(&self, text: &str) -> Result<(), String> {
        let url = origin(text)?;
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        let connection = match state.find(&url) {
            Some(index) => state.connections.remove(index),
            None => {
                if state.connections.len() >= SERVERS {
                    return Err(format!(
                        "Connect to at most {SERVERS} servers; disconnect one first."
                    ));
                }
                let generation = state.next();
                Connection {
                    origin: url,
                    credentials: Credentials::default(),
                    generation,
                }
            }
        };
        state.connections.insert(0, connection);
        Ok(())
    }
    /** Disconnects from a server, forgetting its credentials and any reply in flight. */
    pub fn disconnect(&self, text: &str) -> Result<(), String> {
        let url = origin(text)?;
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        if let Some(index) = state.find(&url) {
            state.connections.remove(index);
        }
        Ok(())
    }
    pub async fn request(
        &self,
        server: &str,
        path: &str,
        method: &str,
        data: Option<Value>,
        csrf: Option<String>,
        challenge: Option<String>,
    ) -> Result<Reply, String> {
        if path.starts_with("auth/")
            && !matches!(
                path,
                "auth/login"
                    | "auth/register"
                    | "auth/logout"
                    | "auth/account"
                    | "auth/revoke-others"
            )
        {
            return Err("Use native browser sign-in for provider authentication".into());
        }
        // A human-verification answer (base64url JSON) for an action the server challenged.
        if challenge.as_ref().is_some_and(|value| {
            value.len() > 4096
                || !value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        }) {
            return Err("Invalid verification answer".into());
        }
        self.request_inner(&origin(server)?, path, method, data, csrf, challenge, None)
            .await
    }
    #[allow(clippy::too_many_arguments)]
    async fn request_inner(
        &self,
        server: &Url,
        path: &str,
        method: &str,
        data: Option<Value>,
        csrf: Option<String>,
        challenge: Option<String>,
        expected: Option<u64>,
    ) -> Result<Reply, String> {
        api_path(path)?;
        if !matches!(method, "GET" | "POST" | "PUT" | "PATCH" | "DELETE") {
            return Err("Invalid API method".into());
        }
        let (epoch, url, token, cookie) = {
            let mut state = self.state.lock().map_err(|e| e.to_string())?;
            let connection = state.connection(server)?;
            if expected.is_some_and(|n| n != connection.generation) {
                return Err("The server connection changed".into());
            }
            (
                connection.generation,
                connection.origin.clone(),
                connection.credentials.token.clone(),
                connection.credentials.login_cookie.clone(),
            )
        };
        let mut request = self
            .client
            .request(
                Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?,
                url.join(&format!("api/{path}"))
                    .map_err(|e| e.to_string())?,
            )
            .header("Origin", url.origin().ascii_serialization())
            .header("X-OC-Client", "desktop");
        if let Some(value) = token {
            request = request.bearer_auth(value);
        }
        if let Some(value) = cookie {
            request = request.header("Cookie", value);
        }
        if let Some(value) = csrf {
            request = request.header("X-CSRF-Token", value);
        }
        if let Some(value) = challenge {
            request = request.header("X-Challenge", value);
        }
        if let Some(value) = data {
            if serde_json::to_vec(&value).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 {
                return Err("Timeline exceeds server request limit".into());
            }
            request = request.json(&value);
        }
        let mut response = request
            .send()
            .await
            .map_err(|_| "Could not connect to the OpenChronology server")?;
        let status = response.status().as_u16();
        let login_cookie = response
            .headers()
            .get_all("set-cookie")
            .iter()
            .filter_map(|h| h.to_str().ok())
            .find(|h| h.starts_with("__Host-oc_login=") || h.starts_with("oc_login="))
            .map(|h| h.split(';').next().unwrap_or("").to_owned());
        if response.content_length().is_some_and(|n| n > LIMIT as u64) {
            return Err("Server response is too large".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Server response interrupted")?
        {
            if bytes.len() + chunk.len() > LIMIT {
                return Err("Server response is too large".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let mut body: Value =
            serde_json::from_slice(&bytes).map_err(|_| "Server returned an invalid response")?;
        // Discard a response if its connection changed while it was in flight.
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        let next = state.generation + 1;
        let Some(connection) = state
            .find(&url)
            .map(|index| &mut state.connections[index])
            .filter(|c| c.generation == epoch)
        else {
            return Err("The server connection changed".into());
        };
        let mut renewed = false;
        let credentials = &mut connection.credentials;
        if let Some(cookie) = login_cookie {
            credentials.login_cookie = Some(cookie);
        }
        if status >= 200 && status < 300 {
            let signed_in = body.get("token").is_some();
            capture_token(&mut body, credentials)?;
            if path == "auth/logout" {
                *credentials = Credentials::default();
                renewed = true;
            } else if signed_in {
                renewed = true;
            }
        } else if status == 401 {
            credentials.token = None;
        }
        if renewed {
            connection.generation = next;
            state.generation = next;
        }
        Ok(Reply { status, body })
    }
    pub async fn start_login(&self, server: &str) -> Result<Value, String> {
        let server = origin(server)?;
        let epoch = {
            let mut state = self.state.lock().map_err(|e| e.to_string())?;
            let generation = state.next();
            let connection = state.connection(&server)?;
            connection.generation = generation;
            connection.credentials.device_code = None;
            generation
        };
        let reply = self
            .request_inner(
                &server,
                "auth/device/start",
                "POST",
                Some(json!({})),
                None,
                None,
                Some(epoch),
            )
            .await?;
        if reply.status != 200 {
            return Err(reply.body["error"]
                .as_str()
                .unwrap_or("Could not start sign-in")
                .into());
        }
        let mut body = reply.body;
        let device = body
            .as_object_mut()
            .and_then(|o| o.remove("deviceCode"))
            .and_then(|v| v.as_str().map(String::from))
            .ok_or("Missing desktop authorization")?;
        let target = Url::parse(
            body["verificationUri"]
                .as_str()
                .ok_or("Missing sign-in URL")?,
        )
        .map_err(|_| "Invalid sign-in URL")?;
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        let connection = state.connection(&server)?;
        if connection.generation != epoch {
            return Err("The server connection changed".into());
        }
        let user_code = body["userCode"].as_str().ok_or("Missing desktop code")?;
        if !device_destination(&target, &connection.origin, user_code) {
            return Err("Invalid sign-in destination".into());
        }
        connection.credentials.device_code = Some(device);
        drop(state);
        let opened = open_browser(target.as_str()).is_ok();
        body["browserOpened"] = Value::Bool(opened);
        Ok(body)
    }
    pub async fn poll_login(&self, server: &str) -> Result<Value, String> {
        let server = origin(server)?;
        let (epoch, device) = {
            let mut state = self.state.lock().map_err(|e| e.to_string())?;
            let connection = state.connection(&server)?;
            (
                connection.generation,
                connection
                    .credentials
                    .device_code
                    .clone()
                    .ok_or("No desktop sign-in pending")?,
            )
        };
        let reply = self
            .request_inner(
                &server,
                "auth/device/poll",
                "POST",
                Some(json!({ "deviceCode": device })),
                None,
                None,
                Some(epoch),
            )
            .await?;
        if reply.status != 200 {
            return Err(reply.body["error"]
                .as_str()
                .unwrap_or("Sign-in expired")
                .into());
        }
        if reply.body["pending"] != true {
            let mut state = self.state.lock().map_err(|e| e.to_string())?;
            if let Ok(connection) = state.connection(&server) {
                if connection.generation == epoch {
                    connection.credentials.device_code = None;
                }
            }
        }
        Ok(reply.body)
    }
}
pub fn image_source(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid image URL")?;
    if value.len() > 4096
        || url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Use a public HTTPS image URL without credentials".into());
    }
    Ok(url)
}
pub fn open_image(value: &str) -> Result<(), String> {
    open_browser(image_source(value)?.as_str())
}
fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(url).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(url).spawn();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn();
    result.map(|_| ()).map_err(|_| {
        "Could not open the system browser. Copy the sign-in URL from the connection dialog.".into()
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn desktop_sign_in_accepts_canonical_next_routes_and_legacy_links_only() {
        let configured = Url::parse("https://timescale.info").unwrap();
        let code = "ABCDEFGH23";
        for path in ["/connect/desktop/ABCDEFGH23", "/#desktop/ABCDEFGH23"] {
            assert!(device_destination(
                &configured.join(path).unwrap(),
                &configured,
                code
            ));
        }
        for value in [
            "https://evil.example/connect/desktop/ABCDEFGH23",
            "https://user@timescale.info/connect/desktop/ABCDEFGH23",
            "https://timescale.info/connect/desktop/ABCDEFGH24",
            "https://timescale.info/connect/desktop/ABCDEFGH23?next=evil",
            "https://timescale.info/connect/desktop/ABCDEFGH23#fragment",
            "https://timescale.info/account",
        ] {
            assert!(!device_destination(
                &Url::parse(value).unwrap(),
                &configured,
                code
            ));
        }
        assert!(!device_destination(&configured, &configured, "bad"));
    }
    #[test]
    fn origins_and_paths_cannot_escape_the_server() {
        for value in [
            "https://chronology.example",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ] {
            assert!(origin(value).is_ok());
        }
        for value in [
            "http://chronology.example",
            "https://u:p@chronology.example",
            "https://chronology.example/path",
            "https://chronology.example/?token=x",
            "file:///tmp/x",
        ] {
            assert!(origin(value).is_err());
        }
        for value in [
            "../secret",
            "//attacker.example",
            "timelines/../auth",
            "auth/%2e%2e",
            "https://example.org",
            "files/import",
        ] {
            assert!(api_path(value).is_err());
        }
        assert!(api_path("timelines/00000000-0000-0000-0000-000000000000/document").is_ok());
        assert!(api_path("timelines/search").is_ok());
        assert!(
            api_path("timelines/00000000-0000-0000-0000-000000000000/proposals/search").is_ok()
        );
        assert!(api_path("timelines/00000000-0000-0000-0000-000000000000/proposals/00000000-0000-0000-0000-000000000001/comments/search").is_ok());
        assert!(api_path("plugins/search").is_ok());
        assert!(api_path("plugins/moment-icons/1").is_ok());
        assert!(api_path("plugins/../auth").is_err());
        assert!(image_source("https://images.example/icon.png").is_ok());
        for url in [
            "javascript:alert(1)",
            "data:image/png;base64,a",
            "file:///etc/passwd",
            "http://example.com/a",
            "https://user:password@example.com/a",
        ] {
            assert!(image_source(url).is_err());
        }
    }
    #[test]
    fn native_credentials_never_enter_the_webview_reply() {
        let mut credentials = Credentials {
            login_cookie: Some("oc_login=nonce".into()),
            ..Default::default()
        };
        let token = "a".repeat(64);
        let mut body = json!({"token": token, "csrf":"csrf", "user":{"id":"u"}});
        capture_token(&mut body, &mut credentials).unwrap();
        assert!(body.get("token").is_none());
        assert_eq!(body["csrf"], "csrf");
        assert_eq!(credentials.token, Some(token));
        assert!(credentials.login_cookie.is_none());
        let mut malformed = json!({"token":"bad"});
        assert!(capture_token(&mut malformed, &mut credentials).is_err());
        assert!(malformed.get("token").is_none());
    }
    #[test]
    fn servers_keep_their_own_sign_ins_and_disconnecting_clears_them() {
        let server = Server::new().unwrap();
        server.connect("https://timescale.info").unwrap();
        server.connect("https://another.example").unwrap();
        assert_eq!(
            server.servers().unwrap(),
            ["https://another.example", "https://timescale.info"]
        );
        let official = Url::parse("https://timescale.info").unwrap();
        {
            let mut state = server.state.lock().unwrap();
            let connection = state.connection(&official).unwrap();
            connection.credentials.token = Some("secret".into());
            connection.credentials.device_code = Some("pending".into());
        }
        assert!(server.connect("http://untrusted.example").is_err());
        // Using a server again keeps its sign-in, and puts it first.
        server.connect("https://timescale.info/").unwrap();
        assert_eq!(server.servers().unwrap()[0], "https://timescale.info");
        let generation = {
            let mut state = server.state.lock().unwrap();
            let connection = state.connection(&official).unwrap();
            assert_eq!(connection.credentials.token.as_deref(), Some("secret"));
            connection.generation
        };
        server.disconnect("https://timescale.info").unwrap();
        assert_eq!(server.servers().unwrap(), ["https://another.example"]);
        server.connect("https://timescale.info").unwrap();
        let mut state = server.state.lock().unwrap();
        let connection = state.connection(&official).unwrap();
        assert!(connection.credentials.token.is_none());
        assert!(connection.credentials.device_code.is_none());
        assert!(connection.generation > generation);
        drop(state);
        for n in 0..SERVERS - 2 {
            server
                .connect(&format!("https://server{n}.example"))
                .unwrap();
        }
        assert!(server.connect("https://one-too-many.example").is_err());
        let unknown = tauri::async_runtime::block_on(server.request(
            "https://unknown.example",
            "session",
            "GET",
            None,
            None,
            None,
        ));
        assert_eq!(
            unknown.err().as_deref(),
            Some("Connect to this server first")
        );
        for path in ["auth/device/start", "auth/device/poll", "auth/google/start"] {
            let result = tauri::async_runtime::block_on(server.request(
                "https://timescale.info",
                path,
                "POST",
                Some(json!({})),
                None,
                None,
            ));
            assert_eq!(
                result.err().as_deref(),
                Some("Use native browser sign-in for provider authentication")
            );
        }
    }
}

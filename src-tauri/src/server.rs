// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
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
struct State {
    origin: Option<Url>,
    credentials: Credentials,
    generation: u64,
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
        let configured = Some(origin(
            option_env!("OPENCHRONOLOGY_SERVER_ORIGIN")
                .filter(|s| !s.is_empty())
                .unwrap_or("https://timescale.info"),
        )?);
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
                origin: configured,
                credentials: Credentials::default(),
                generation: 0,
            }),
        })
    }
    pub fn configured(&self) -> Result<Option<String>, String> {
        Ok(self
            .state
            .lock()
            .map_err(|e| e.to_string())?
            .origin
            .as_ref()
            .map(|url| url.origin().ascii_serialization()))
    }
    pub fn configure(&self, value: Option<String>) -> Result<(), String> {
        let url = value
            .filter(|v| !v.is_empty())
            .map(|text| origin(&text))
            .transpose()?;
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        state.generation += 1;
        state.origin = url;
        state.credentials = Credentials::default();
        Ok(())
    }
    pub async fn request(
        &self,
        path: &str,
        method: &str,
        data: Option<Value>,
        csrf: Option<String>,
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
        self.request_inner(path, method, data, csrf, None).await
    }
    async fn request_inner(
        &self,
        path: &str,
        method: &str,
        data: Option<Value>,
        csrf: Option<String>,
        expected: Option<u64>,
    ) -> Result<Reply, String> {
        api_path(path)?;
        if !matches!(method, "GET" | "POST" | "PUT" | "PATCH" | "DELETE") {
            return Err("Invalid API method".into());
        }
        let (epoch, url, token, cookie) = {
            let state = self.state.lock().map_err(|e| e.to_string())?;
            if expected.is_some_and(|n| n != state.generation) {
                return Err("The server connection changed".into());
            }
            (
                state.generation,
                state.origin.clone().ok_or("Connect to a server first")?,
                state.credentials.token.clone(),
                state.credentials.login_cookie.clone(),
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
        // Discard a response if the configured server changed while it was in flight.
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        if state.generation != epoch || state.origin.as_ref() != Some(&url) {
            return Err("The server connection changed".into());
        }
        let credentials = &mut state.credentials;
        if let Some(cookie) = login_cookie {
            credentials.login_cookie = Some(cookie);
        }
        if status >= 200 && status < 300 {
            let signed_in = body.get("token").is_some();
            capture_token(&mut body, credentials)?;
            if path == "auth/logout" {
                *credentials = Credentials::default();
                state.generation += 1;
            } else if signed_in {
                state.generation += 1;
            }
        } else if status == 401 {
            credentials.token = None;
        }
        Ok(Reply { status, body })
    }
    pub async fn start_login(&self) -> Result<Value, String> {
        let epoch = {
            let mut state = self.state.lock().map_err(|e| e.to_string())?;
            state.generation += 1;
            state.credentials.device_code = None;
            state.generation
        };
        let reply = self
            .request_inner(
                "auth/device/start",
                "POST",
                Some(json!({})),
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
        if state.generation != epoch {
            return Err("The server connection changed".into());
        }
        let configured = state.origin.clone().ok_or("Connect to a server first")?;
        let user_code = body["userCode"].as_str().ok_or("Missing desktop code")?;
        if !device_destination(&target, &configured, user_code) {
            return Err("Invalid sign-in destination".into());
        }
        state.credentials.device_code = Some(device);
        drop(state);
        let opened = open_browser(target.as_str()).is_ok();
        body["browserOpened"] = Value::Bool(opened);
        Ok(body)
    }
    pub async fn poll_login(&self) -> Result<Value, String> {
        let (epoch, device) = {
            let state = self.state.lock().map_err(|e| e.to_string())?;
            (
                state.generation,
                state
                    .credentials
                    .device_code
                    .clone()
                    .ok_or("No desktop sign-in pending")?,
            )
        };
        let reply = self
            .request_inner(
                "auth/device/poll",
                "POST",
                Some(json!({ "deviceCode": device })),
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
            if state.generation == epoch {
                state.credentials.device_code = None;
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
    fn changing_or_disconnecting_a_server_clears_credentials_and_pending_requests() {
        let server = Server::new().unwrap();
        {
            let mut state = server.state.lock().unwrap();
            state.credentials.token = Some("secret".into());
            state.credentials.device_code = Some("pending".into());
        }
        assert!(server
            .configure(Some("http://untrusted.example".into()))
            .is_err());
        assert!(server.state.lock().unwrap().credentials.token.is_some());
        let generation = server.state.lock().unwrap().generation;
        server
            .configure(Some("https://another.example".into()))
            .unwrap();
        let state = server.state.lock().unwrap();
        assert!(state.credentials.token.is_none());
        assert!(state.credentials.device_code.is_none());
        assert!(state.generation > generation);
        drop(state);
        server.configure(None).unwrap();
        assert!(server.configured().unwrap().is_none());
        for path in ["auth/device/start", "auth/device/poll", "auth/google/start"] {
            let result =
                tauri::async_runtime::block_on(server.request(path, "POST", Some(json!({})), None));
            assert_eq!(
                result.err().as_deref(),
                Some("Use native browser sign-in for provider authentication")
            );
        }
    }
}

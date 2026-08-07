//! Kaspa SilverScript Studio local preflight entry point.
//!
//! This binary is built against a pinned Kascov revision and reuses Kascov's
//! exact pure-computation preflight module. It reads transaction JSON from
//! stdin and writes a single JSON report to stdout. It never connects to a
//! node, reads keys, broadcasts, or persists input.

#[path = "preflight.rs"]
mod preflight;

use std::fmt;
use std::io::{self, Read};
use std::str::FromStr;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Network {
    Mainnet,
    Testnet(u32),
}

impl fmt::Display for Network {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Mainnet => formatter.write_str("mainnet"),
            Self::Testnet(suffix) => write!(formatter, "testnet-{suffix}"),
        }
    }
}

impl FromStr for Network {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "mainnet" => Ok(Self::Mainnet),
            _ => value
                .strip_prefix("testnet-")
                .and_then(|suffix| suffix.parse().ok())
                .map(Self::Testnet)
                .ok_or_else(|| format!("invalid network: {value}")),
        }
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let network_arg = std::env::args()
        .nth(1)
        .ok_or_else(|| "usage: kascov-preflight <mainnet|testnet-N>".to_string())?;
    let network = Network::from_str(&network_arg).map_err(|error| error.to_string())?;
    let mut body = String::new();
    io::stdin()
        .read_to_string(&mut body)
        .map_err(|error| format!("failed to read transaction JSON: {error}"))?;
    if body.trim().is_empty() {
        return Err("transaction JSON is empty".to_string());
    }
    let report = preflight::run(&body, network)?;
    println!(
        "{}",
        serde_json::to_string(&report)
            .map_err(|error| format!("failed to serialize preflight report: {error}"))?
    );
    Ok(())
}

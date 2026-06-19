#!/usr/bin/env bash
set -o errexit

echo "📦 Step 1: Installing Node dependencies..."
npm install

echo "🦀 Step 2: Checking for Rust / Cargo..."
if ! command -v cargo &> /dev/null
then
    echo "  ⚠️ Cargo not found. Installing rustup inline..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
else
    echo "  ✓ Cargo is already available."
fi

echo "🛠️ Step 3: Compiling the Rust lemonscraper binary..."
cargo build --release

echo "🚀 Step 4: Build complete!"

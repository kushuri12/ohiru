#!/bin/bash
set -e

echo "🔄 Updating O-Hiru..."

# 1. Update package
npm update -g @kushuri12/ohiru

# 2. Run doctor to fix any config migrations
hiru doctor --fix

echo "✅ Update complete."

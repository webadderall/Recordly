cask "recordly" do
  arch arm: "arm64", intel: "x64"

  version "1.1.14"
  sha256 arm:   "e669ab7c8bdd4596211937183ee2374545da5482702cab0dfe477c1466422b0f",
         intel: "85f5183219de0b656400625797ff9299893bd8fbda8455b0f745878b2c729526"

  url "https://github.com/webadderallorg/Recordly/releases/download/v#{version}/Recordly-#{arch}.dmg"
  name "Recordly"
  desc "Creator-focused screen recorder with auto-zoom, cursor effects, and more"
  homepage "https://github.com/webadderallorg/Recordly"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Recordly.app"

  zap trash: [
    "~/Library/Application Support/Recordly",
    "~/Library/Preferences/dev.recordly.app.plist",
    "~/Library/Saved Application State/dev.recordly.app.savedState",
  ]
end

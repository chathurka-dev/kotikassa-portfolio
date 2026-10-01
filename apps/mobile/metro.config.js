// Expo auto-detects the monorepo (watchFolders + nodeModulesPaths).
// NativeWind wraps the default config to compile Tailwind classes.
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

module.exports = withNativeWind(config, { input: './global.css' })

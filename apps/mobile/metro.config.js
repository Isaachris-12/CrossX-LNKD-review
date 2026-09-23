// Metro config for an npm-workspaces monorepo: the mobile app's own
// dependencies live in apps/mobile/node_modules, but shared/hoisted
// packages (expo, react, @crossx/shared, etc.) live in the workspace
// root's node_modules, so Metro needs to know to look in both places.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;

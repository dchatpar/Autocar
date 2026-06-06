/**
 * Babel configuration for DealerOS mobile.
 *
 * The `react-native-reanimated/plugin` MUST be the last plugin in the
 * list — Reanimated patches the worklet runtime during babel transform,
 * and any plugin that runs after it would break the worklet bytecode.
 *
 * `expo-router/babel` provides the standard Expo Router babel transforms
 * (route file conventions, typed routes). It must come before the
 * Reanimated plugin.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      "expo-router/babel",
      "react-native-reanimated/plugin",
    ],
  };
};

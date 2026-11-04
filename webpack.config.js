import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// build.js writes the HTML into dist/ first; this only adds bundle.js.
export default (env, argv) => ({
  entry: "./src/main.jsx",
  output: {
    path: path.join(__dirname, "dist"),
    filename: "bundle.js",
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: "babel-loader",
        options: {
          presets: [
            "@babel/preset-env",
            // Must match webpack's mode, or production React throws "jsxDEV is not a function".
            [
              "@babel/preset-react",
              { runtime: "automatic", development: argv.mode !== "production" },
            ],
          ],
          plugins: ["@babel/transform-runtime"],
        },
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx"],
  },
});

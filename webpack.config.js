import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Builds the React app into public/bundle.js, which server.js serves.
export default (env, argv) => ({
  entry: "./src/main.jsx",
  output: {
    path: path.join(__dirname, "public"),
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
  // React and the router are ~250 KB; that is fine for a local piece.
  performance: { hints: false },
  resolve: {
    extensions: [".js", ".jsx"],
  },
});

const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './index.js',
  mode: process.env.NODE_ENV,
  externals: [ nodeExternals() ],
  target: 'node',
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: 'index.js'
  },
  resolve: {
    extensions: ['.ts', '.js'],
  }
}
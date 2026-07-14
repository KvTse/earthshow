module.exports = {
  publicPath: './',
  outputDir: 'dist',
  assetsDir: 'static',
  devServer: {
    proxy: {
      '/data/forecast/query': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },
  chainWebpack: config => {
    config.plugin('html').tap(args => {
      args[0].title = '风、气象状况的全球地图';
      args[0].templateParameters = Object.assign({}, args[0].templateParameters, {
        apiBase: process.env.NODE_ENV === 'production' ? 'http://tongtsing.top/earthshow' : 'http://localhost:8080'
      });
      return args;
    });
  }
};

/*
 * @Description: API configuration for data sources
 * @Author: Liu Yang
 * @Date: 2021-08-26
 * @FilePath: \earth-vue\src\config\api.js
 */

export default {
  // Primary API endpoint for weather data
  endpoint: 'http://localhost:8080/data/forecast/query',

  // Parameter mapping from internal names to API model names
  paramMapping: {
    'ncep': 'GFS',
    'cma': 'CMA',
    'ocean': 'OSCAR'
  },

  // Element/overlay type mapping
  elementMapping: {
    'wind': 'wind',
    'temp': 'temp',
    'relative_humidity': 'rh',
    'air_density': 'air_density',
    'wind_power_density': 'wpd',
    'total_cloud_water': 'tcw',
    'total_precipitable_water': 'tpw',
    'mslp': 'mslp'
  }
}

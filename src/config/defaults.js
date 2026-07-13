/*
 * @Description: Default configuration for the earth application
 * @Author: Liu Yang
 * @Date: 2021-08-26
 * @FilePath: \earth-vue\src\config\defaults.js
 */

export default {
  // Default data source: 'api' for API interface, 'file' for static files
  dataSource: 'api',

  // Default parameter mode: 'ncep', 'cma', or 'ocean'
  param: 'ncep',

  // Default surface type
  surface: 'surface',

  // Default level
  level: 'level',

  // Default projection
  projection: 'orthographic',

  // Default overlay type
  overlayType: 'default',

  // Show play animation by default
  showPlay: true,

  // Show grid points
  showGridPoints: false
}

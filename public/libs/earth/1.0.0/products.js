/**
 * products - defines the behavior of weather data grids, including grid construction, interpolation, and color scales.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
var products = function () {
  "use strict";

  var WEATHER_PATH = "/data/weather";
  var OSCAR_PATH = "/data/oscar";

  // API 模式配置
  var API_MODE_CONFIG = {
    apiEndpoint: (window.__API_BASE__ || 'http://localhost:8080') + '/data/forecast/query',
    paramMapping: {
      "ncep": "GFS",
      "cma": "CMA",
      "ocean": "OSCAR"
    },
    elementMapping: {
      "wind": "wind",
      "default": "wind",
      "temp": "temp",
      "relative_humidity": "rh",
      "air_density": "air_density",
      "wind_power_density": "wpd",
      "total_cloud_water": "tcw",
      "total_precipitable_water": "tpw",
      "mslp": "mslp"
    }
  };

  var catalogs = {
    //OSCAR目录是一个文件名数组，排序和前缀为yyyyMMdd。最后一项是
    //最近的。例如：[20140101-abc.json，20140106-abc.json，20140112-abc.json，…]
    oscar: µ.loadJson([OSCAR_PATH, "catalog.json"].join("/"))
  };

  console.log(catalogs)

  function buildProduct (overrides) {
    return _.extend({
      description: "",
      paths: [],
      date: null,
      navigate: function (step) {
        return gfsHourStep(this.date, step);
      },
      load: function (cancel, getData) {
        var me = this;
        return when.map(this.paths, µ.loadJson).then(files => {
          getData(files)
          return cancel.requested ? null : _.extend(me, buildGrid(me.builder.apply(me, files)));
        })
      }
    }, overrides);
  }

  /**
   * @param attr
   * @param {String} type
   * @param {String?} surface
   * @param {String?} level
   * @returns {String}
   */
  function gfs1p0degPath (attr, type, surface, level) {
    var time = attr.time || ''
    var dir = attr.date, stamp = dir === "current" ? "current" : attr.hour;
    var file = [stamp, type, surface, level, "gfs", "1.0"].filter(µ.isValue).join("-") + ".json";
    return [WEATHER_PATH, time, dir, file].join("/");
  }

  function gfsDate (attr) {
    if (attr.date === "current") {
      // Construct the date from the current time, rounding down to the nearest three-hour block.
      var now = new Date(Date.now()), hour = Math.floor(now.getUTCHours() / 3);
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
    }
    var parts = attr.date.split("/");
    if (parts.length === 1 && parts[0].length === 8) {
      parts = [parts[0].substring(0, 4), parts[0].substring(4, 6), parts[0].substring(6, 8)];
    }
    if (parts.length < 3 || !parts[2]) {
      return new Date(NaN);
    }
    return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], +String(attr.hour || "0000").substr(0, 2)));
  }

  /**
   * Returns a date for the chronologically next or previous GFS data layer. How far forward or backward in time
   * to jump is determined by the step. Steps of ±1 move in 3-hour jumps, and steps of ±10 move in 24-hour jumps.
   */
  function gfsStep (date, step) {
    if (!date || isNaN(date.getTime())) return null;
    var offset = (step > 1 ? 8 : step < -1 ? -8 : step) * 3;
    var adjusted = new Date(date);
    adjusted.setHours(adjusted.getHours() + offset);
    return adjusted;
  }

  function gfsHourStep (date, step) {
    console.log('[gfsHourStep] input date:', date, 'valid:', date && !isNaN(date.getTime()), 'step:', step);
    if (!date || isNaN(date.getTime())) return null;
    var adjusted = new Date(date);
    adjusted.setHours(adjusted.getHours() + step);
    console.log('[gfsHourStep] output:', adjusted, 'valid:', !isNaN(adjusted.getTime()));
    return adjusted;
  }

  function netcdfHeader (time, lat, lon, center) {
    return {
      lo1: lon.sequence.start,
      la1: lat.sequence.start,
      dx: lon.sequence.delta,
      dy: -lat.sequence.delta,
      nx: lon.sequence.size,
      ny: lat.sequence.size,
      refTime: time.data[0],
      forecastTime: 0,
      centerName: center
    };
  }

  function describeSurface (attr) {
    return attr.surface === "surface" ? "Surface" : µ.capitalize(attr.level);
  }

  function describeSurfaceJa (attr) {
    return attr.surface === "surface" ? "地上" : µ.capitalize(attr.level);
  }

  /**
   * Returns a function f(langCode) that, given table:
   *     {foo: {en: "A", ja: "あ"}, bar: {en: "I", ja: "い"}}
   * will return the following when called with "en":
   *     {foo: "A", bar: "I"}
   * or when called with "ja":
   *     {foo: "あ", bar: "い"}
   */
  function localize (table) {
    return function (langCode) {
      var result = {};
      _.each(table, function (value, key) {
        result[key] = value[langCode] || value.en || value;
      });
      return result;
    }
  }

  // ========== API 模式辅助函数 ==========

  function getScalarName (type) {
    var names = {
      temp: "Temp",
      relative_humidity: "Relative Humidity",
      air_density: "Air Density",
      wind_power_density: "Wind Power Density",
      total_cloud_water: "Total Cloud Water",
      total_precipitable_water: "Total Precipitable Water",
      mslp: "Mean Sea Level Pressure"
    };
    return names[type] || "Value";
  }

  function getScalarNameJa (type) {
    var names = {
      temp: "気温",
      relative_humidity: "相対湿度",
      air_density: "空気密度",
      wind_power_density: "風力エネルギー密度",
      total_cloud_water: "雲水量",
      total_precipitable_water: "可降水量",
      mslp: "海面更正気圧"
    };
    return names[type] || "値";
  }

  function getScalarUnits (type) {
    switch (type) {
      case "temp":
        return [
          { label: "°C", conversion: function (x) { return x - 273.15; }, precision: 1 },
          { label: "°F", conversion: function (x) { return x * 9 / 5 - 459.67; }, precision: 1 },
          { label: "K", conversion: function (x) { return x; }, precision: 1 }
        ];
      case "relative_humidity":
        return [{ label: "%", conversion: function (x) { return x; }, precision: 0 }];
      case "air_density":
        return [{ label: "kg/m³", conversion: function (x) { return x; }, precision: 2 }];
      case "wind_power_density":
        return [
          { label: "kW/m²", conversion: function (x) { return x / 1000; }, precision: 1 },
          { label: "W/m²", conversion: function (x) { return x; }, precision: 0 }
        ];
      case "total_cloud_water":
      case "total_precipitable_water":
        return [{ label: "kg/m²", conversion: function (x) { return x; }, precision: 3 }];
      case "mslp":
        return [
          { label: "hPa", conversion: function (x) { return x / 100; }, precision: 0 },
          { label: "mmHg", conversion: function (x) { return x / 133.322387415; }, precision: 0 },
          { label: "inHg", conversion: function (x) { return x / 3386.389; }, precision: 1 }
        ];
      default:
        return [{ label: "", conversion: function (x) { return x; }, precision: 2 }];
    }
  }

  function getScalarScale (type) {
    switch (type) {
      case "temp":
        return {
          bounds: [193, 328],
          gradient: µ.segmentedColorScale([
            [193, [37, 4, 42]],
            [206, [41, 10, 130]],
            [219, [81, 40, 40]],
            [233.15, [192, 37, 149]],
            [255.372, [70, 215, 215]],
            [273.15, [21, 84, 187]],
            [275.15, [24, 132, 14]],
            [291, [247, 251, 59]],
            [298, [235, 167, 21]],
            [311, [230, 71, 39]],
            [328, [88, 27, 67]]
          ])
        };
      case "relative_humidity":
        return {
          bounds: [0, 100],
          gradient: function (v, a) {
            return µ.sinebowColor(Math.min(v, 100) / 100, a);
          }
        };
      case "air_density":
        return {
          bounds: [0, 1.5],
          gradient: function (v, a) {
            return µ.sinebowColor(Math.min(v, 1.5) / 1.5, a);
          }
        };
      case "wind_power_density":
        return {
          bounds: [0, 80000],
          gradient: µ.segmentedColorScale([
            [0, [15, 4, 96]],
            [250, [30, 8, 180]],
            [1000, [121, 102, 2]],
            [2000, [118, 161, 66]],
            [4000, [50, 102, 219]],
            [8000, [19, 131, 193]],
            [16000, [59, 204, 227]],
            [64000, [241, 1, 45]],
            [80000, [243, 0, 241]]
          ])
        };
      case "total_cloud_water":
        return {
          bounds: [0, 1],
          gradient: µ.segmentedColorScale([
            [0.0, [5, 5, 89]],
            [0.2, [170, 170, 230]],
            [1.0, [255, 255, 255]]
          ])
        };
      case "total_precipitable_water":
        return {
          bounds: [0, 70],
          gradient: µ.segmentedColorScale([
            [0, [230, 165, 30]],
            [10, [120, 100, 95]],
            [20, [40, 44, 92]],
            [30, [21, 13, 193]],
            [40, [75, 63, 235]],
            [60, [25, 255, 255]],
            [70, [150, 255, 255]]
          ])
        };
      case "mslp":
        return {
          bounds: [92000, 105000],
          gradient: µ.segmentedColorScale([
            [92000, [40, 0, 0]],
            [95000, [187, 60, 31]],
            [96500, [137, 32, 30]],
            [98000, [16, 1, 43]],
            [100500, [36, 1, 93]],
            [101300, [241, 254, 18]],
            [103000, [228, 246, 223]],
            [105000, [255, 255, 255]]
          ])
        };
      default:
        return {
          bounds: [0, 100],
          gradient: function (v, a) {
            return µ.sinebowColor(Math.min(v, 100) / 100, a);
          }
        };
    }
  }

  // 构建 API 请求参数
  function buildApiParams (attr) {
    return {
      model: API_MODE_CONFIG.paramMapping[attr.param] || "GFS",
      datatime: attr.date === "current" ? µ.dateToUTCymd(new Date(), "") : attr.date.replace(/\//g, ""),
      hour: attr.hour || "0000",
      element: API_MODE_CONFIG.elementMapping[attr.overlayType] || API_MODE_CONFIG.elementMapping[attr.param] || "wind",
      surface: attr.surface,
      level: attr.level,
      overlayType: attr.overlayType
    };
  }

  // ========== API 模式产品工厂 ==========
  var API_FACTORIES = {

    // API 风场 (向量场)
    "api_wind": {
      matches: _.matches({ dataSource: "api", field: "vector" }),
      create: function (attr) {
        return buildProduct({
          field: "vector",
          type: "api_wind",
          description: localize({
            name: { en: "Wind (API)", ja: "风速" },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          apiConfig: {
            endpoint: API_MODE_CONFIG.apiEndpoint,
            params: buildApiParams(attr)
          },
          date: gfsDate(attr),
          load: function (cancel, getData) {
            var me = this;
            return µ.loadJsonFromApi(this.apiConfig.endpoint, this.apiConfig.params)
              .then(function (result) {
                if (cancel.requested) return null;
                // 从 API 结果中取出 dataUrl，直接用 loadJson 加载原始 JSON
                var dataUrl = result.data && result.data.dataUrl;
                if (!dataUrl) {
                  throw new Error('API 未返回 dataUrl: ' + JSON.stringify(result));
                }
                console.log('API dataUrl:', dataUrl);
                return µ.loadJson(dataUrl).then(function (file) {
                  if (cancel.requested) return null;
                  getData([file]);
                  var gridResult = buildGrid(me.builder(file));
                  gridResult.sourceUrl = dataUrl;
                  return _.extend(me, gridResult);
                });
              })
              .catch(function (err) {
                console.error("API load error:", err);
                throw err;
              });
          },
          builder: function (file) {
            var uFile, vFile;
            if (Array.isArray(file)) {
              uFile = file[0];
              vFile = file[1];
            } else {
              uFile = file;
              vFile = file;
            }
            var uData = uFile.msg_list && uFile.msg_list.u !== undefined ? uFile.msg_list.u : uFile.data;
            var vData = vFile.msg_list && vFile.msg_list.v !== undefined ? vFile.msg_list.v : vFile.data;
            var header = uFile.header || (uFile.msg_list && uFile.msg_list.header);
            return {
              header: header,
              interpolate: bilinearInterpolateVector,
              data: function (i) {
                return [uData[i], vData[i]];
              }
            }
          },
          units: [
            { label: "km/h", conversion: function (x) { return x * 3.6; }, precision: 0 },
            { label: "m/s", conversion: function (x) { return x; }, precision: 1 },
            { label: "kn", conversion: function (x) { return x * 1.943844; }, precision: 0 },
            { label: "mph", conversion: function (x) { return x * 2.236936; }, precision: 0 }
          ],
          scale: {
            bounds: [0, 100],
            gradient: function (v, a) {
              return µ.extendedSinebowColor(Math.min(v, 100) / 100, a);
            }
          },
          particles: { velocityScale: 1 / 60000, maxIntensity: 17 }
        });
      }
    },

    // API 标量场 (温度、湿度等)
    "api_scalar": {
      matches: _.matches({ dataSource: "api", field: "scalar" }),
      create: function (attr) {
        var overlayType = attr.overlayType || "temp";
        return buildProduct({
          field: "scalar",
          type: "api_" + overlayType,
          description: localize({
            name: { en: getScalarName(overlayType), ja: getScalarNameJa(overlayType) },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          apiConfig: {
            endpoint: API_MODE_CONFIG.apiEndpoint,
            params: buildApiParams(attr)
          },
          date: gfsDate(attr),
          load: function (cancel, getData) {
            var me = this;
            console.log('[api_scalar.load] 开始加载，params:', this.apiConfig.params);
            return µ.loadJsonFromApi(this.apiConfig.endpoint, this.apiConfig.params)
              .then(function (result) {
                if (cancel.requested) return null;
                console.log('[api_scalar.load] scalar API 返回:', result);
                var scalarDataUrl = result.data && result.data.dataUrl;
                if (!scalarDataUrl) {
                  throw new Error('API 未返回 dataUrl: ' + JSON.stringify(result));
                }
                console.log('API scalarDataUrl:', scalarDataUrl);
                return µ.loadJson(scalarDataUrl);
              })
              .then(function (scalarFile) {
                if (cancel.requested) return null;
                console.log('[api_scalar.load] scalarFile loaded');
                // 同时加载风场数据作为 overlayGrid
                var windParams = _.extend({}, me.apiConfig.params, { element: "wind", overlayType: "wind" });
                console.log('[api_scalar.load] 开始加载风场，windParams:', windParams);
                return µ.loadJsonFromApi(me.apiConfig.endpoint, windParams)
                  .then(function (windResult) {
                    console.log('[api_scalar.load] wind API 返回:', windResult);
                    console.log('[api_scalar.load] wind API 返回的完整 data:', JSON.stringify(windResult.data).substring(0, 500));
                    if (cancel.requested) return null;
                    var windDataUrl = windResult.data && windResult.data.dataUrl;
                    var inlineData = windResult.data && windResult.data.data;
                    console.log('API windDataUrl:', windDataUrl, 'inlineData:', inlineData);

                    // 如果 inlineData 存在，直接使用它作为风场数据
                    if (inlineData) {
                      console.log('[api_scalar.load] 使用 inline 风场数据');
                      getData([scalarFile, inlineData]);
                      var scalarGrid = me.builder(scalarFile);
                      var windGrid = me.windBuilder(inlineData);
                      console.log('windGrid:', windGrid);
                      var product = _.extend(me, buildGrid(scalarGrid), {
                        scalarGrid: buildGrid(scalarGrid),
                        overlayGrid: _.extend(windGrid, { field: "vector", particles: { velocityScale: 1 / 60000, maxIntensity: 17 } })
                      });
                      console.log('api_scalar product overlayGrid:', product.overlayGrid);
                      return product;
                    }

                    if (!windDataUrl) {
                      console.warn('API 未返回风场 dataUrl，跳过粒子效果');
                      var overlayGrid = buildGrid(me.builder(scalarFile));
                      overlayGrid.field = "scalar";
                      overlayGrid.description = localize({
                        name: { en: "None", ja: "なし" },
                        qualifier: { en: "", ja: "" }
                      });
                      getData([scalarFile]);
                      return _.extend(me, buildGrid(me.builder(scalarFile)), {
                        overlayGrid: overlayGrid
                      });
                    }
                    console.log('[api_scalar.load] 开始加载风场数据文件:', windDataUrl);
                    return µ.loadJson(windDataUrl).then(function (windFile) {
                      console.log('[api_scalar.load] windFile loaded, raw keys:', windFile && Object.keys(windFile));
                      console.log('[api_scalar.load] windFile:', windFile);
                      console.log('[api_scalar.load] windFile.header:', windFile && windFile.header);
                      console.log('[api_scalar.load] windFile.data:', windFile && windFile.data);
                      console.log('[api_scalar.load] windFile.data type:', windFile && windFile.data && typeof windFile.data);
                      console.log('[api_scalar.load] windFile.data isArray:', windFile && windFile.data && Array.isArray(windFile.data));
                      if (windFile && windFile.data && Array.isArray(windFile.data)) {
                        console.log('[api_scalar.load] windFile.data.length:', windFile.data.length);
                        console.log('[api_scalar.load] windFile.data[0]:', windFile.data[0]);
                        console.log('[api_scalar.load] windFile.data[0] type:', typeof windFile.data[0]);
                      }
                      getData([scalarFile, windFile]);
                      var scalarGrid = me.builder(scalarFile);
                      var windGrid = me.windBuilder(windFile);
                      console.log('windGrid:', windGrid);
                      var product = _.extend(me, buildGrid(scalarGrid), {
                        scalarGrid: buildGrid(scalarGrid),
                        overlayGrid: _.extend(windGrid, { field: "vector", particles: { velocityScale: 1 / 60000, maxIntensity: 17 } })
                      });
                      console.log('api_scalar product overlayGrid:', product.overlayGrid);
                      return product;
                    });
                  });
              })
              .catch(function (err) {
                console.error("API load error:", err);
                throw err;
              });
          },
          windBuilder: function (file) {
            var uFile, vFile;
            var uData, vData;

            console.log('[windBuilder] file type:', typeof file, Array.isArray(file) ? 'array' : 'object');
            console.log('[windBuilder] file length:', file ? file.length : 'N/A');
            console.log('[windBuilder] file[0]:', file && file[0]);

            // 处理各种数据格式
            if (Array.isArray(file) && file.length >= 2) {
              // 格式1: [uFile, vFile] - 当前 API 返回的格式
              uFile = file[0];
              vFile = file[1];
              console.log('[windBuilder] 格式1: 数组长度 >= 2');
              console.log('[windBuilder] uFile.data:', uFile && uFile.data);
              console.log('[windBuilder] uFile.data[0]:', uFile && uFile.data && uFile.data[0]);
              console.log('[windBuilder] uFile.data[0] type:', uFile && uFile.data && typeof uFile.data[0]);
              // 直接提取 data 数组
              if (uFile && uFile.data && Array.isArray(uFile.data)) {
                uData = uFile.data;
                console.log('[windBuilder] 提取 uData 长度:', uData && uData.length);
              }
              if (vFile && vFile.data && Array.isArray(vFile.data)) {
                vData = vFile.data;
                console.log('[windBuilder] 提取 vData 长度:', vData && vData.length);
              }
            } else if (Array.isArray(file) && file.length === 1) {
              // 格式4: [{header, data: [...]}] 单个对象包含完整数据
              uFile = file[0];
              vFile = file[0];
            } else if (file && typeof file === 'object') {
              uFile = file;
              vFile = file;
            } else {
              uFile = null;
              vFile = null;
            }

            // 从文件中提取 u/v 数据
            if (!uData) {
              if (uFile && uFile.msg_list && uFile.msg_list.u !== undefined) {
                uData = uFile.msg_list.u;
                vData = vFile && vFile.msg_list ? vFile.msg_list.v : uFile.msg_list.v;
              } else if (uFile && uFile.data && typeof uFile.data.u !== 'undefined') {
                uData = uFile.data.u;
                vData = vFile && vFile.data ? vFile.data.v : uFile.data.v;
              } else if (uFile && uFile.data && Array.isArray(uFile.data)) {
                // 格式5: {header, data: [uData, vData]} - 当前 API 返回的格式
                console.log('[windBuilder] 检测到 data 是数组，长度:', uFile.data.length);
                if (uFile.data.length >= 2) {
                  uData = uFile.data[0];
                  vData = uFile.data[1];
                  console.log('[windBuilder] 提取 uData 长度:', uData && uData.length, 'vData 长度:', vData && vData.length);
                } else if (uFile.data.length === 1) {
                  // 单个数组，可能是标量数据
                  console.log('[windBuilder] data 只有一个元素，可能需要其他处理');
                }
              } else if (uFile && typeof uFile === 'object') {
                // 检查对象中是否有 u/v 键
                var keys = Object.keys(uFile);
                console.log('[windBuilder] 对象键:', keys);
                if (uFile.u !== undefined && uFile.v !== undefined) {
                  uData = uFile.u;
                  vData = uFile.v;
                }
              }
            }

            if (!uData || !vData) {
              console.warn('[windBuilder] 风场数据格式不匹配，使用默认占位数据');
              console.log('[windBuilder] uData:', uData, 'vData:', vData);
              var len = 360 * 181;
              uData = new Array(len).fill(0);
              vData = new Array(len).fill(0);
            }

            var header = uFile && (uFile.header || (uFile.msg_list && uFile.msg_list.header)) || null;
            var attr = { surface: this.apiConfig.params.surface };
            var λ0 = header ? header.lo1 : 0;
            var φ0 = header ? header.la1 : 90;
            var Δλ = header ? header.dx : 2.5;
            var Δφ = header ? header.dy : 2.5;
            var ni = header ? header.nx : 360;
            var nj = header ? header.ny : 181;
            var isContinuous = header ? (Math.floor(ni * Δλ) >= 360) : false;
            // Build columns like buildGrid does
            var columns = [];
            for (var j = 0; j < nj; j++) {
              var col = [];
              for (var i = 0; i < ni; i++) {
                var p = isContinuous ? (j * ni + i) : (j * ni + i);
                col[i] = [uData[p], vData[p]];
              }
              if (isContinuous) col.push(col[0]);
              columns[j] = col;
            }
            return {
              header: header || netcdfHeader(uFile.variables ? uFile.variables.time : null, uFile.variables ? uFile.variables.lat : null, uFile.variables ? uFile.variables.lon : null, null),
              interpolate: function (λ, φ) {
                var i = µ.floorMod(λ - λ0, 360) / Δλ;
                var j = (φ0 - φ) / Δφ;
                var fi = Math.floor(i), ci = fi + 1;
                var fj = Math.floor(j), cj = fj + 1;
                var row0 = columns[fj], row1 = columns[cj];
                if (row0 && row1) {
                  return bilinearInterpolateVector(i - fi, j - fj, row0[fi], row0[ci], row1[fi], row1[ci]);
                }
                return null;
              },
              data: function (i, j) {
                return columns[j] ? columns[j][i] : null;
              },
              field: "vector",
              units: [{ label: "m/s", conversion: function (x) { return x; }, precision: 1 }],
              scale: {
                bounds: [0, 33],
                gradient: µ.segmentedColorScale([
                  [0, [40, 40, 180]],
                  [5, [55, 126, 184]],
                  [10, [77, 175, 74]],
                  [15, [152, 78, 163]],
                  [20, [255, 255, 0]],
                  [25, [255, 127, 0]],
                  [33, [215, 48, 39]]
                ])
              },
              particles: { velocityScale: 1 / 60000, maxIntensity: 17 },
              description: localize({
                name: { en: "Wind (API)", ja: "风速" },
                qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
              })
            };
          },
          builder: function (file) {
            var record = Array.isArray(file) ? file[0] : file;
            return {
              header: record.header,
              interpolate: bilinearInterpolateScalar,
              data: function (i) {
                return record.data[i];
              }
            };
          },
          units: getScalarUnits(overlayType),
          scale: getScalarScale(overlayType),
          particles: { velocityScale: 1 / 60000, maxIntensity: 17 }
        });
      }
    },

    // API 默认模式 - 只在没有指定 field 时匹配
    "api_default": {
      matches: function(attr) {
        return attr.dataSource === "api" && !attr.field;
      },
      create: function (attr) {
        var overlayType = attr.overlayType;
        var scalarTypes = ["temp", "relative_humidity", "air_density", "wind_power_density",
                          "total_cloud_water", "total_precipitable_water", "mslp"];
        if (overlayType && scalarTypes.indexOf(overlayType) !== -1) {
          return API_FACTORIES.api_scalar.create(_.extend({}, attr, { field: "scalar" }));
        }
        return API_FACTORIES.api_wind.create(_.extend({}, attr, { field: "vector" }));
      }
    }
  };

  var FACTORIES = {

    "wind": {
      matches: _.matches({ param: "ncep" }),
      create: function (attr) {
        return buildProduct({
          field: "vector",
          type: "ncep",
          description: localize({
            name: { en: "Wind", ja: "风速" },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          paths: [gfs1p0degPath(attr, "ncep", attr.surface, attr.level)],
          date: gfsDate(attr),
          builder: function (file) {
            var uFile, vFile;
            if (Array.isArray(file)) {
              uFile = file[0];
              vFile = file[1];
            } else {
              uFile = file;
              vFile = file;
            }
            var uData = uFile.msg_list && uFile.msg_list.u !== undefined ? uFile.msg_list.u : uFile.data;
            var vData = vFile.msg_list && vFile.msg_list.v !== undefined ? vFile.msg_list.v : vFile.data;
            var header = uFile.header || (uFile.msg_list && uFile.msg_list.header);
            return {
              header: header,
              interpolate: bilinearInterpolateVector,
              data: function (i) {
                return [uData[i], vData[i]];
              }
            }
          },
          units: [
            { label: "km/h", conversion: function (x) { return x * 3.6; }, precision: 0 },
            { label: "m/s", conversion: function (x) { return x; }, precision: 1 },
            { label: "kn", conversion: function (x) { return x * 1.943844; }, precision: 0 },
            { label: "mph", conversion: function (x) { return x * 2.236936; }, precision: 0 }
          ],
          scale: {
            bounds: [0, 100],
            gradient: function (v, a) {
              return µ.extendedSinebowColor(Math.min(v, 100) / 100, a);
            }
          },
          particles: { velocityScale: 1 / 60000, maxIntensity: 17 }
        });
      }
    },
    "temp": {
      matches: _.matches({ param: "ncep", overlayType: "temp" }),
      create: function (attr) {
        return buildProduct({
          field: "scalar",
          type: "temp",
          description: localize({
            name: { en: "Temp", ja: "気温" },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          paths: [gfs1p0degPath(attr, "temp", attr.surface, attr.level)],
          date: gfsDate(attr),
          builder: function (file) {
            var record = Array.isArray(file) ? file[0] : file;
            var data = record.data;
            if (!data) {
              var vars = record.variables;
              var temp = vars.Temperature_isobaric || vars.Temperature_height_above_ground;
              data = temp.data;
            }
            return {
              header: record.header || netcdfHeader(record.variables.time, record.variables.lat, record.variables.lon, record.Originating_or_generating_Center),
              interpolate: bilinearInterpolateScalar,
              data: function (i) {
                return data[i];
              }
            }
          },
          units: [
            { label: "°C", conversion: function (x) { return x - 273.15; }, precision: 1 },
            { label: "°F", conversion: function (x) { return x * 9 / 5 - 459.67; }, precision: 1 },
            { label: "K", conversion: function (x) { return x; }, precision: 1 }
          ],
          scale: {
            bounds: [193, 328],
            gradient: µ.segmentedColorScale([
              [193, [37, 4, 42]],
              [206, [41, 10, 130]],
              [219, [81, 40, 40]],
              [233.15, [192, 37, 149]],  // -40 C/F
              [255.372, [70, 215, 215]],  // 0 F
              [273.15, [21, 84, 187]],   // 0 C
              [275.15, [24, 132, 14]],   // just above 0 C
              [291, [247, 251, 59]],
              [298, [235, 167, 21]],
              [311, [230, 71, 39]],
              [328, [88, 27, 67]]
            ])
          }
        });
      }
    },
    //增加模式
    "cmawind": {
      matches: _.matches({ param: "cmawind" }),
      create: function (attr) {
        console.log(attr, 9090)
        return buildProduct({
          field: "vector",
          type: "cmawind",
          description: localize({
            name: { en: "Wind", ja: "风速" },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          paths: [gfs1p0degPath(attr, "cmawind", attr.surface, attr.level)],
          date: gfsDate(attr),
          builder: function (file) {
            var uFile, vFile;
            if (Array.isArray(file)) {
              uFile = file[0];
              vFile = file[1];
            } else {
              uFile = file;
              vFile = file;
            }
            var uData = uFile.msg_list && uFile.msg_list.u !== undefined ? uFile.msg_list.u : uFile.data;
            var vData = vFile.msg_list && vFile.msg_list.v !== undefined ? vFile.msg_list.v : vFile.data;
            var header = uFile.header || (uFile.msg_list && uFile.msg_list.header);
            return {
              header: header,
              interpolate: bilinearInterpolateVector,
              data: function (i) {
                return [uData[i], vData[i]];
              }
            }
          },
          units: [
            { label: "km/h", conversion: function (x) { return x * 3.6; }, precision: 0 },
            { label: "m/s", conversion: function (x) { return x; }, precision: 1 },
            { label: "kn", conversion: function (x) { return x * 1.943844; }, precision: 0 },
            { label: "mph", conversion: function (x) { return x * 2.236936; }, precision: 0 }
          ],
          scale: {
            bounds: [0, 100],
            gradient: function (v, a) {
              return µ.extendedSinebowColor(Math.min(v, 100) / 100, a);
            }
          },
          particles: { velocityScale: 1 / 60000, maxIntensity: 17 }
        });
      }
    },
    "cmatemp": {
      matches: _.matches({ param: "cma", overlayType: "cmatemp" }),
      create: function (attr) {
        return buildProduct({
          field: "scalar",
          type: "cmatemp",
          description: localize({
            name: { en: "Temp", ja: "気温" },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          paths: [gfs1p0degPath(attr, "cmatemp", attr.surface, attr.level)],
          date: gfsDate(attr),
          builder: function (file) {
            var record = Array.isArray(file) ? file[0] : file;
            var data = record.data;
            if (!data) {
              var vars = record.variables;
              var temp = vars.Temperature_isobaric || vars.Temperature_height_above_ground;
              data = temp.data;
            }
            return {
              header: record.header || netcdfHeader(record.variables.time, record.variables.lat, record.variables.lon, record.Originating_or_generating_Center),
              interpolate: bilinearInterpolateScalar,
              data: function (i) {
                return data[i];
              }
            }
          },
          units: [
            { label: "°C", conversion: function (x) { return x - 273.15; }, precision: 1 },
            { label: "°F", conversion: function (x) { return x * 9 / 5 - 459.67; }, precision: 1 },
            { label: "K", conversion: function (x) { return x; }, precision: 1 }
          ],
          scale: {
            bounds: [193, 328],
            gradient: µ.segmentedColorScale([
              [193, [37, 4, 42]],
              [206, [41, 10, 130]],
              [219, [81, 40, 40]],
              [233.15, [192, 37, 149]],  // -40 C/F
              [255.372, [70, 215, 215]],  // 0 F
              [273.15, [21, 84, 187]],   // 0 C
              [275.15, [24, 132, 14]],   // just above 0 C
              [291, [247, 251, 59]],
              [298, [235, 167, 21]],
              [311, [230, 71, 39]],
              [328, [88, 27, 67]]
            ])
          }
        });
      }
    },
    "cma": {
      matches: _.matches({ param: "cma" }),
      create: function (attr) {
        return buildProduct({
          field: "vector",
          type: "cma",
          description: localize({
            name: { en: "Wind", ja: "风速" },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          paths: [gfs1p0degPath(attr, "cma", attr.surface, attr.level)],
          date: gfsDate(attr),
          builder: function (file) {
            var uFile = Array.isArray(file) ? file[0] : file;
            var vFile = Array.isArray(file) ? file[1] : file;
            var uData = uFile.msg_list && uFile.msg_list.u !== undefined ? uFile.msg_list.u : uFile.data;
            var vData = vFile.msg_list && vFile.msg_list.v !== undefined ? vFile.msg_list.v : vFile.data;
            var header = uFile.header || (uFile.msg_list && uFile.msg_list.header);
            return {
              header: header,
              interpolate: bilinearInterpolateVector,
              data: function (i) {
                return [uData[i], vData[i]];
              }
            }
          },
          units: [
            { label: "km/h", conversion: function (x) { return x * 3.6; }, precision: 0 },
            { label: "m/s", conversion: function (x) { return x; }, precision: 1 },
            { label: "kn", conversion: function (x) { return x * 1.943844; }, precision: 0 },
            { label: "mph", conversion: function (x) { return x * 2.236936; }, precision: 0 }
          ],
          scale: {
            bounds: [0, 100],
            gradient: function (v, a) {
              return µ.extendedSinebowColor(Math.min(v, 100) / 100, a);
            }
          },
          particles: { velocityScale: 1 / 60000, maxIntensity: 17 }
        });
      }
    },

    "relative_humidity": {
      matches: _.matches({ param: "ncep", overlayType: "relative_humidity" }),
      create: function (attr) {
        return buildProduct({
          field: "scalar",
          type: "relative_humidity",
          description: localize({
            name: { en: "Relative Humidity", ja: "相対湿度" },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          paths: [gfs1p0degPath(attr, "relative_humidity", attr.surface, attr.level)],
          date: gfsDate(attr),
          builder: function (file) {
            var record = Array.isArray(file) ? file[0] : file;
            var data = record.data;
            if (!data) {
              var vars = record.variables;
              var rh = vars.Relative_humidity_isobaric || vars.Relative_humidity_height_above_ground;
              data = rh.data;
            }
            return {
              header: record.header || netcdfHeader(record.variables.time, record.variables.lat, record.variables.lon, record.Originating_or_generating_Center),
              interpolate: bilinearInterpolateScalar,
              data: function (i) {
                return data[i];
              }
            };
          },
          units: [
            { label: "%", conversion: function (x) { return x; }, precision: 0 }
          ],
          scale: {
            bounds: [0, 100],
            gradient: function (v, a) {
              return µ.sinebowColor(Math.min(v, 100) / 100, a);
            }
          }
        });
      }
    },

    "air_density": {
      matches: _.matches({ param: "ncep", overlayType: "air_density" }),
      create: function (attr) {
        return buildProduct({
          field: "scalar",
          type: "air_density",
          description: localize({
            name: { en: "Air Density", ja: "空気密度" },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          paths: [gfs1p0degPath(attr, "air_density", attr.surface, attr.level)],
          date: gfsDate(attr),
          builder: function (file) {
            var record = Array.isArray(file) ? file[0] : file;
            var data = record.data;
            if (!data) {
              var vars = record.variables;
              var air_density = vars.air_density;
              data = air_density.data;
            }
            return {
              header: record.header || netcdfHeader(record.variables.time, record.variables.lat, record.variables.lon, record.Originating_or_generating_Center),
              interpolate: bilinearInterpolateScalar,
              data: function (i) {
                return data[i];
              }
            };
          },
          units: [
            { label: "kg/m³", conversion: function (x) { return x; }, precision: 2 }
          ],
          scale: {
            bounds: [0, 1.5],
            gradient: function (v, a) {
              return µ.sinebowColor(Math.min(v, 1.5) / 1.5, a);
            }
          }
        });
      }
    },

    "wind_power_density": {
      matches: _.matches({ param: "ncep", overlayType: "wind_power_density" }),
      create: function (attr) {
        var windProduct = FACTORIES.wind.create(attr);
        var airdensProduct = FACTORIES.air_density.create(attr);
        return buildProduct({
          field: "scalar",
          type: "wind_power_density",
          description: localize({
            name: { en: "Wind Power Density", ja: "風力エネルギー密度" },
            qualifier: { en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr) }
          }),
          paths: [windProduct.paths[0], airdensProduct.paths[0]],
          date: gfsDate(attr),
          builder: function (windFile, airdensFile) {
            var windBuilder = windProduct.builder(windFile);
            var airdensBuilder = airdensProduct.builder(airdensFile);
            var windData = windBuilder.data, windInterpolate = windBuilder.interpolate;
            var airdensData = airdensBuilder.data, airdensInterpolate = airdensBuilder.interpolate;
            return {
              header: _.clone(airdensBuilder.header),
              interpolate: function (x, y, g00, g10, g01, g11) {
                var m = windInterpolate(x, y, g00[0], g10[0], g01[0], g11[0])[2];
                var ρ = airdensInterpolate(x, y, g00[1], g10[1], g01[1], g11[1]);
                return 0.5 * ρ * m * m * m;
              },
              data: function (i) {
                return [windData(i), airdensData(i)];
              }
            };
          },
          units: [
            { label: "kW/m²", conversion: function (x) { return x / 1000; }, precision: 1 },
            { label: "W/m²", conversion: function (x) { return x; }, precision: 0 }
          ],
          scale: {
            bounds: [0, 80000],
            gradient: µ.segmentedColorScale([
              [0, [15, 4, 96]],
              [250, [30, 8, 180]],
              [1000, [121, 102, 2]],
              [2000, [118, 161, 66]],
              [4000, [50, 102, 219]],
              [8000, [19, 131, 193]],
              [16000, [59, 204, 227]],
              [64000, [241, 1, 45]],
              [80000, [243, 0, 241]]
            ])
          }
        });
      }
    },

    "total_cloud_water": {
      matches: _.matches({ param: "ncep", overlayType: "total_cloud_water" }),
      create: function (attr) {
        return buildProduct({
          field: "scalar",
          type: "total_cloud_water",
          description: localize({
            name: { en: "Total Cloud Water", ja: "雲水量" },
            qualifier: ""
          }),
          paths: [gfs1p0degPath(attr, "total_cloud_water")],
          date: gfsDate(attr),
          builder: function (file) {
            var record = file[0], data = record.data;
            return {
              header: record.header,
              interpolate: bilinearInterpolateScalar,
              data: function (i) {
                return data[i];
              }
            }
          },
          units: [
            { label: "kg/m²", conversion: function (x) { return x; }, precision: 3 }
          ],
          scale: {
            bounds: [0, 1],
            gradient: µ.segmentedColorScale([
              [0.0, [5, 5, 89]],
              [0.2, [170, 170, 230]],
              [1.0, [255, 255, 255]]
            ])
          }
        });
      }
    },

    "total_precipitable_water": {
      matches: _.matches({ param: "ncep", overlayType: "total_precipitable_water" }),
      create: function (attr) {
        return buildProduct({
          field: "scalar",
          type: "total_precipitable_water",
          description: localize({
            name: { en: "Total Precipitable Water", ja: "可降水量" },
            qualifier: ""
          }),
          paths: [gfs1p0degPath(attr, "total_precipitable_water")],
          date: gfsDate(attr),
          builder: function (file) {
            var record = file[0], data = record.data;
            return {
              header: record.header,
              interpolate: bilinearInterpolateScalar,
              data: function (i) {
                return data[i];
              }
            }
          },
          units: [
            { label: "kg/m²", conversion: function (x) { return x; }, precision: 3 }
          ],
          scale: {
            bounds: [0, 70],
            gradient:
              µ.segmentedColorScale([
                [0, [230, 165, 30]],
                [10, [120, 100, 95]],
                [20, [40, 44, 92]],
                [30, [21, 13, 193]],
                [40, [75, 63, 235]],
                [60, [25, 255, 255]],
                [70, [150, 255, 255]]
              ])
          }
        });
      }
    },

    "mslp": {
      matches: _.matches({ param: "ncep", overlayType: "mslp" }),
      create: function (attr) {
        return buildProduct({
          field: "scalar",
          type: "mslp",
          description: localize({
            name: { en: "Mean Sea Level Pressure", ja: "海面更正気圧" },
            qualifier: ""
          }),
          paths: [gfs1p0degPath(attr, "mslp")],
          date: gfsDate(attr),
          builder: function (file) {
            var record = file[0], data = record.data;
            return {
              header: record.header,
              interpolate: bilinearInterpolateScalar,
              data: function (i) {
                return data[i];
              }
            }
          },
          units: [
            { label: "hPa", conversion: function (x) { return x / 100; }, precision: 0 },
            { label: "mmHg", conversion: function (x) { return x / 133.322387415; }, precision: 0 },
            { label: "inHg", conversion: function (x) { return x / 3386.389; }, precision: 1 }
          ],
          scale: {
            bounds: [92000, 105000],
            gradient: µ.segmentedColorScale([
              [92000, [40, 0, 0]],
              [95000, [187, 60, 31]],
              [96500, [137, 32, 30]],
              [98000, [16, 1, 43]],
              [100500, [36, 1, 93]],
              [101300, [241, 254, 18]],
              [103000, [228, 246, 223]],
              [105000, [255, 255, 255]]
            ])
          }
        });
      }
    },

    "currents": {
      matches: _.matches({ param: "ocean", surface: "surface", level: "currents" }),
      create: function (attr) {
        return when(catalogs.oscar).then(function (catalog) {
          return buildProduct({
            field: "vector",
            type: "currents",
            description: localize({
              name: { en: "Ocean Currents", ja: "海流" },
              qualifier: { en: " @ Surface", ja: " @ 地上" }
            }),
            paths: [oscar0p33Path(catalog, attr)],
            date: oscarDate(catalog, attr),
            navigate: function (step) {
              console.log('[api_wind navigate] this.date:', this.date, 'step:', step);
              var next = gfsHourStep(this.date, step);
              console.log('[api_wind navigate] next:', next, 'valid:', next && !isNaN(next.getTime()));
              return next;
            },
            builder: function (file) {
              var uData = file[0].data, vData = file[1].data;
              return {
                header: file[0].header,
                interpolate: bilinearInterpolateVector,
                data: function (i) {
                  var u = uData[i], v = vData[i];
                  return µ.isValue(u) && µ.isValue(v) ? [u, v] : null;
                }
              }
            },
            units: [
              { label: "m/s", conversion: function (x) { return x; }, precision: 2 },
              { label: "km/h", conversion: function (x) { return x * 3.6; }, precision: 1 },
              { label: "kn", conversion: function (x) { return x * 1.943844; }, precision: 1 },
              { label: "mph", conversion: function (x) { return x * 2.236936; }, precision: 1 }
            ],
            scale: {
              bounds: [0, 1.5],
              gradient: µ.segmentedColorScale([
                [0, [10, 25, 68]],
                [0.15, [10, 25, 250]],
                [0.4, [24, 255, 93]],
                [0.65, [255, 233, 102]],
                [1.0, [255, 233, 15]],
                [1.5, [255, 15, 15]]
              ])
            },
            particles: { velocityScale: 1 / 4400, maxIntensity: 0.7 }
          });
        });
      }
    },

    "off": {
      matches: _.matches({ overlayType: "off" }),
      create: function () {
        return null;
      }
    }
  };

  /**
   * Returns the file name for the most recent OSCAR data layer to the specified date. If offset is non-zero,
   * the file name that many entries from the most recent is returned.
   *
   * The result is undefined if there is no entry for the specified date and offset can be found.
   *
   * UNDONE: the catalog object itself should encapsulate this logic. GFS can also be a "virtual" catalog, and
   *         provide a mechanism for eliminating the need for /data/weather/current/* files.
   *
   * @param {Array} catalog array of file names, sorted and prefixed with yyyyMMdd. Last item is most recent.
   * @param {String} date string with format yyyy/MM/dd or "current"
   * @param {Number?} offset
   * @returns {String} file name
   */
  function lookupOscar (catalog, date, offset) {
    offset = +offset || 0;
    if (date === "current") {
      return catalog[catalog.length - 1 + offset];
    }
    var prefix = µ.ymdRedelimit(date, "/", ""), i = _.sortedIndex(catalog, prefix);
    i = (catalog[i] || "").indexOf(prefix) === 0 ? i : i - 1;
    return catalog[i + offset];
  }

  function oscar0p33Path (catalog, attr) {
    var file = lookupOscar(catalog, attr.date);
    return file ? [OSCAR_PATH, file].join("/") : null;
  }

  function oscarDate (catalog, attr) {
    var file = lookupOscar(catalog, attr.date);
    var parts = file ? µ.ymdRedelimit(file, "", "/").split("/") : null;
    return parts ? new Date(Date.UTC(+parts[0], parts[1] - 1, +parts[2], 0)) : null;
  }

  /**
   * @returns {Date} the chronologically next or previous OSCAR data layer. How far forward or backward in
   * time to jump is determined by the step and the catalog of available layers. A step of ±1 moves to the
   * next/previous entry in the catalog (about 5 days), and a step of ±10 moves to the entry six positions away
   * (about 30 days).
   */
  function oscarStep (catalog, date, step) {
    var file = lookupOscar(catalog, µ.dateToUTCymd(date, "/"), step > 1 ? 6 : step < -1 ? -6 : step);
    var parts = file ? µ.ymdRedelimit(file, "", "/").split("/") : null;
    return parts ? new Date(Date.UTC(+parts[0], parts[1] - 1, +parts[2], 0)) : null;
  }

  function dataSource (header) {
    // noinspection FallthroughInSwitchStatementJS
    switch (header.center || header.centerName) {
      case -3:
        return "OSCAR / Earth & Space Research";
      case 7:
      case "US National Weather Service, National Centres for Environmental Prediction (NCEP)":
        return "GFS / NCEP / US National Weather Service";
      default:
        return header.centerName;
    }
  }

  function bilinearInterpolateScalar (x, y, g00, g10, g01, g11) {
    var rx = (1 - x);
    var ry = (1 - y);
    return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
  }

  function bilinearInterpolateVector (x, y, g00, g10, g01, g11) {
    var rx = (1 - x);
    var ry = (1 - y);
    var a = rx * ry, b = x * ry, c = rx * y, d = x * y;
    var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
    var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
    return [u, v, Math.sqrt(u * u + v * v)];
  }

  /**
   * Builds an interpolator for the specified data in the form of JSON-ified GRIB files. Example:
   *
   *     [
   *       {
   *         "header": {
   *           "refTime": "2013-11-30T18:00:00.000Z",
   *           "parameterCategory": 2,
   *           "parameterNumber": 2,
   *           "surface1Type": 100,
   *           "surface1Value": 100000.0,
   *           "forecastTime": 6,
   *           "scanMode": 0,
   *           "nx": 360,
   *           "ny": 181,
   *           "lo1": 0,
   *           "la1": 90,
   *           "lo2": 359,
   *           "la2": -90,
   *           "dx": 1,
   *           "dy": 1
   *         },
   *         "data": [3.42, 3.31, 3.19, 3.08, 2.96, 2.84, 2.72, 2.6, 2.47, ...]
   *       }
   *     ]
   *
   */
  function buildGrid (builder) {
    // var builder = createBuilder(data);

    var header = builder.header;
    var λ0 = header.lo1, φ0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
    var Δλ = header.dx, Δφ = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
    var ni = header.nx, nj = header.ny;    // number of grid points W-E and N-S (e.g., 144 x 73)
    var date = new Date(header.refTime);
    if (!isNaN(date.getTime())) {
      var forecastHours = Number(header.forecastTime);
      if (!isNaN(forecastHours)) {
        date.setHours(date.getHours() + forecastHours);
      }
    }
    console.log('[buildGrid] header.refTime:', header.refTime, 'header.forecastTime:', header.forecastTime, 'date:', date, 'valid:', !isNaN(date.getTime()));

    // Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ0.
    // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
    var grid = [], p = 0;
    var isContinuous = Math.floor(ni * Δλ) >= 360;
    for (var j = 0; j < nj; j++) {
      var row = [];
      for (var i = 0; i < ni; i++, p++) {
        row[i] = builder.data(p);
      }
      if (isContinuous) {
        // For wrapped grids, duplicate first column as last column to simplify interpolation logic
        row.push(row[0]);
      }
      grid[j] = row;
    }

    function interpolate (λ, φ) {
      var i = µ.floorMod(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
      var j = (φ0 - φ) / Δφ;                 // calculate latitude index in direction +90 to -90

      //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
      //        fi  i   ci          four points "G" that enclose point (i, j). These points are at the four
      //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
      //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
      //    j ___|_ .   |           (1, 9) and (2, 9).
      //  =8.3   |      |
      //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
      //         |      |           column, so the index ci can be used without taking a modulo.

      var fi = Math.floor(i), ci = fi + 1;
      var fj = Math.floor(j), cj = fj + 1;

      var row;
      if ((row = grid[fj])) {
        var g00 = row[fi];
        var g10 = row[ci];
        if (µ.isValue(g00) && µ.isValue(g10) && (row = grid[cj])) {
          var g01 = row[fi];
          var g11 = row[ci];
          if (µ.isValue(g01) && µ.isValue(g11)) {
            // All four points found, so interpolate the value.
            return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
          }
        }
      }
      // console.log("cannot interpolate: " + λ + "," + φ + ": " + fi + " " + ci + " " + fj + " " + cj);
      return null;
    }

    return {
      source: dataSource(header),
      date: date,
      interpolate: interpolate,
      forEachPoint: function (cb) {
        for (var j = 0; j < nj; j++) {
          var row = grid[j] || [];
          for (var i = 0; i < ni; i++) {
            cb(µ.floorMod(180 + λ0 + i * Δλ, 360) - 180, φ0 - j * Δφ, row[i]);
          }
        }
      }
    };
  }

  function productsFor (attributes) {
    var attr = _.clone(attributes), results = [];
    var dataSource = attr.dataSource || "api";

    // 根据数据源选择工厂
    var factories = dataSource === "api" ? API_FACTORIES : FACTORIES;

    _.values(factories).forEach(function (factory) {
      if (factory.matches(attr)) {
        results.push(factory.create(attr));
      }
    });
    return results.filter(µ.isValue);
  }

  return {
    overlayTypes: d3.set(_.keys(FACTORIES).concat(_.keys(API_FACTORIES))),
    productsFor: productsFor
  };

}();

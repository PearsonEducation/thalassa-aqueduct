var clc = require('cli-color')
  ;

var levelColors = {
  debug: clc.blue,
  info: clc.yellow,
  error: clc.red
};

var sep = ' - ';

function printLevel(level) {
  return (levelColors[level] || clc.white)(level) + sep;
}

module.exports = function (level, message, meta) {
  var optMeta = (meta) ? sep + JSON.stringify(meta) : '';
  console.log(printLevel(level) +  message + optMeta);
};
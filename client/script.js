var socket = io();
const SVG_NS = "http://www.w3.org/2000/svg";
const icon = "https://cdn.mos.cms.futurecdn.net/JtVH5Khvihib7dBDFY9ZDR.jpg"

socket.emit('get_cases');
socket.emit('get_news');
socket.emit('get_ports');

// in: alpha 2 code, type ('airport', 'airport_closed', 'harbour', 'harbour_closed'), x/y in percentages
const addPort = (country, type, offsetX, offsetY) => {
  const path = document.querySelector(`path[data-id=${country}]`)
  
  const rect = path.getBoundingClientRect();

  var x = rect.left + offsetX * rect.width;
  var y = rect.top + offsetY * rect.height;

  var elem = `<img class="port"
                   src="static/img/${type}.jpg"
                   style="left: ${x}px; top: ${y}px;"
              />`

  $("#ports").append(elem);
}

const drawPorts = () => {
  if (window.portData) {
    portData = window.portData
    Object.keys(portData).map((country) => {
      const airports = portData[country]['airports']
      const harbours = portData[country]['harbours']

      airports.forEach((airport) => {
        const x = airport['offset_x'];
        const y = airport['offset_y'];
        const closed = airport['closed'];
        const fileName = closed ? 'airport_closed' : 'airport';
    
        addPort(country, fileName, x, y);
      })

      harbours.forEach((airport) => {
        const x = airport['offset_x'];
        const y = airport['offset_y'];
        const closed = airport['closed'];
        const fileName = closed ? 'harbour_closed' : 'harbour';
    
        addPort(country, fileName, x, y);
      })
    })
  }
}

function formatDate(date) {
  var d = new Date(date),
      month = '' + (d.getMonth() + 1),
      day = '' + d.getDate(),
      year = d.getFullYear();

  if (month.length < 2) 
      month = '0' + month;
  if (day.length < 2) 
      day = '0' + day;

  return [year, month, day].join('-');
}

const redrawMap = (id) => {
  if (id == "svgMap") {
    $("#ports").empty()
    $("#svgMap .svgMap-map-wrapper").remove()
    $("#points").empty()

    const date = formatDate(window.day)
    const data = window.data ? window.data[date] : {}

    window.map = new svgMap({
      isClipPath: false,
      targetElementID: 'svgMap',
      initialZoom: 1,
      minZoom: 1,
      maxZoom: 1,
      data: {
        data: {
          total_cases: {
            visible: true,
            name: 'Total Cases',
            format: '{0} Total Cases',
            thousandSeparator: ',',
            thresholdMax: 100000,
            thresholdMin: 1
          },
          log_total_cases: {
            visible: false,
            name: 'Log Total Cases',
            format: '{0} Total Cases',
            thousandSeparator: ',',
            thresholdMax: 12,
            thresholdMin: 1
          }
        },
        applyData: 'log_total_cases',
        values: data
      }
    });

    if (data) {
      // generate points
      Object.keys(data).forEach((key) => {
        generatePointInCountry(key, data[key]['total_cases'], data[key]['population'])
      });
    }
    
  } else if (id == "svgBg") {
    // clearLayers();
    $("#svgBg .svgMap-map-wrapper").remove()

    window.bg = new svgMap({
      isClipPath: true,
      targetElementID: 'svgBg',
      initialZoom: 1,
      minZoom: 1,
      maxZoom: 1,
      data: {
        data: {
          gdp: {
            name: 'GDP per capita',
            format: '{0} USD',
            thousandSeparator: ',',
            thresholdMax: 50000,
            thresholdMin: 1000
          },
          change: {
            name: 'Change to year before',
            format: '{0} %'
          }
        },
        applyData: 'gdp',
        values: {
          AF: {gdp: 587, change: 4.73},
          AL: {gdp: 4583, change: 11.09},
          DZ: {gdp: 4293, change: 10.01}
          // ...
        }
      }
    });
  }
  drawPorts();
}

redrawMap("svgBg")

window.addEventListener("resize", function() {
  checkOrientation();
  redrawMap("svgBg")
  redrawMap("svgMap")
  clearHandlers()
  attachHandlers()
});

// generate css polygon (array of pts) from path
const pathToPoly = (path,samples) => {
  var doc = path.ownerDocument;
  // var poly = doc.createElementNS('http://www.w3.org/2000/svg','polygon');
  
  var points = [];
  var len  = path.getTotalLength();
  var step = step=len/samples;

  // Put each island as a separate polygon
  var curr_island = 0;
  points[curr_island] = [];

  // Track change in island
  var prev_p = path.getPointAtLength(0);
  var threshold = 100;
  
  for (var i=0;i<=len;i+=step){
    var p = path.getPointAtLength(i);

    // Old implementation: push all points
    // points.push([p.x, p.y]);

    // If same island
    if (Math.pow((p.x - prev_p.x), 2) + Math.pow((p.y - prev_p.y), 2) < threshold) {
      points[curr_island].push([p.x, p.y]);
      prev_p = p;
    }
    // If new island
    else if (i + step <= len) {
      curr_island += 1;
      points[curr_island] = [];
      prev_p = path.getPointAtLength(i+step);
    }
  }
  // poly.setAttribute('points',points.join(' '));
  return points;
}

const pointInPolygon = function (point, vs) {
  // ray-casting algorithm based on
  // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
  var xi, xj, i, intersect,
      x = point[0],
      y = point[1],
      inside = false;
  for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    xi = vs[i][0],
    yi = vs[i][1],
    xj = vs[j][0],
    yj = vs[j][1],
    intersect = ((yi > y) != (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// in: 2-letter abbreviation of country (ex. RU, CA, US, CN)
// out: void, generates random pt in country path 
const generatePointInCountry = (country, infected, population) => {
  // select path element
  if (country.length != 2) return;
  
  const path = document.querySelector(`path[data-id=${country}]`);
  if (path) {
    // rectangular bounding box
    const bbox = path.getBBox();
    const area = bbox.width * bbox.height;

    // make it look nice - scale by area, infected, and population
    var numberDots = (Math.log(area)/30) * infected / Math.log(population);
    // var numberDots = 30000; // stress test
    if (numberDots > area/2)
    {
      numberDots = Math.round(area/2);
    }

    // console.log(area);
    // console.log(numberDots);

    const minX = bbox.x;
    const minY = bbox.y;
    const maxX = bbox.x + bbox.width;
    const maxY = bbox.y + bbox.height;

    // polygon representation of country
    var sampling = 200; // default sampling
    // Big/weird countries to increase sampling
    if (country === 'IT' || country === 'CN' || country === 'US' || country === 'RU' || country == 'CA') {
      sampling = 1000;
    }
    const poly = pathToPoly(path, sampling);
    
    // draw dots
    var g = d3.select("#points")
                .append("g")
                .attr("transform", window.transform);
    
    // let g = document.createElementNS(SVG_NS, "g");
    for (let i = 0; i < numberDots; i++) {
      let x = Math.floor(Math.random() * (maxX - minX) ) + minX;
      let y = Math.floor(Math.random() * (maxY - minY) ) + minY;
      // console.log([x, y])

      // Test each "island"
      var len = poly.length;
      for (var j = 0; j < len; j++) {
        if (pointInPolygon([x, y], poly[j])) {
          // console.log("inside");
          g.append("circle")
                    .attr("style", "fill: #670B07;")
                    .attr("cx", x)
                    .attr("cy", y)
                    .attr("r", 1.2);
          break;
        }
      }
      
    }
  }
};

var selectedCountry = 'WR';
const updateSelectedCountry = (date) => {
  if (selectedCountry == 'WR'){
    updateWorldData(date);
    fill(icon, "World", window.world_infected, window.world_dead, window.world_population);
    return;
  }
  // populate data
  const name = window.map.countries[selectedCountry];
  const flag = `https://cdn.jsdelivr.net/gh/hjnilsson/country-flags@latest/svg/${selectedCountry.toLowerCase()}.svg`;
  var infected, dead, population;
  if (window.data[date][selectedCountry]) {
    infected = window.data[date][selectedCountry]['total_cases'];
    dead = window.data[date][selectedCountry]['total_deaths'];
    population = window.data[date][selectedCountry]['population'];
  } else {
    infected = 'No data';
    dead = 'No data';
    population = '0';
  }
  fill(flag, name, infected, dead, population);
}

const updateWorldData = (date) => {
  // populate world data
  window.world_infected = data[date]['WR']['total_cases'];
  window.world_dead = data[date]['WR']['total_deaths'];
  window.world_population = 7771104755;
}

const update = () => {
  var date = formatDate(window.day);

  if (data_loaded &&
      news_loaded &&
      ports_loaded) {
    redrawMap("svgMap");
    attachHandlers();
    updateWorldData(date);
    updateSelectedCountry(date);
    fillNewsBar(date);
  }
}

var data_loaded = false;
socket.on('load_finish', (data) => {
  console.log(data)
  window.data = data
  
  data_loaded = true;
  update();
});

var news_loaded = false;
socket.on('news_loaded', (data) => {
  console.log(data);
  window.newsData = data;
  populateNews();

  news_loaded = true;
  update();
});

var ports_loaded = false;
socket.on('ports_loaded', (data) => {
  window.portData = data;

  ports_loaded = true;
  update();
})

const clearHandlers = () => {
  $('path[id^="svgMap-map-country"]').off();
  $('.svgMap-map-wrapper').off();
}

const attachHandlers = () => {
  $('path[id^="svgMap-map-country"]').on("click touchstart", (e) => {
    e.stopPropagation();
    const country = e.target.getAttribute("data-id");
    const flag = `https://cdn.jsdelivr.net/gh/hjnilsson/country-flags@latest/svg/${country.toLowerCase()}.svg`
    const name = window.map.countries[country];

    const date = formatDate(window.day);

    var infected, dead, population;
    if (window.data[date][country]) {
      infected = window.data[date][country]['total_cases']
      dead = window.data[date][country]['total_deaths']
      population = window.data[date][country]['population']
    } else {
      infected = 'No data'
      dead = 'No data'
      population = '0'
    }

    fill(flag, name, infected, dead, population);

    selectedCountry = country;
  });

  $('.svgMap-map-wrapper').on("click touchstart", (e) => {
    fill(icon, "World", window.world_infected, window.world_dead, window.world_population);
  });
}

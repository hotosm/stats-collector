const request = require('request')
const turf = require('turf')
const queue = require('d3-queue').queue
const q = queue(20)

var aggregatedData = {}

// fetch all projects

var options = {
  headers: {
    'Accept': 'application/json',
    'Accept-Language': 'en'
  }
}
options.url = 'https://tasks.hotosm.org/api/v1/stats/home-page'

request(options, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var data = JSON.parse(body)
    aggregatedData['mappersOnline'] = data['mappersOnline']
    aggregatedData['totalTasksMapped'] = data['totalTasksMapped']
    aggregatedData['totalMappers'] = data['totalMappers']
  }
})
options.url = 'https://tasks.hotosm.org/api/v1/project/search'
request(options, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var data = JSON.parse(body)
    data.mapResults.features.forEach(function (project) {
      q.defer(function (callback) {
        options.url = 'https://tasks.hotosm.org/api/v1/project/' + project.properties.projectId + '?as_file=false'
        request(options, function (error, response, body) {
          if (!error && response.statusCode === 200) {
            callback(null, body)
          }
        })
      })
    })
    q.awaitAll(function (error, results) {
      if (error) throw error
      console.log(results.length)
      aggregatedData['totalProjects'] = results.length
      var area = 0
      results.forEach(function (project) {
        project = JSON.parse(project)
        var feature = {
          'type': 'Feature',
          'properties': {}
        }
        feature['geometry'] = project['areaOfInterest']
        area = area + turf.area(feature) / 1000000
      })
      aggregatedData['totalArea'] = area
      console.log(JSON.stringify(aggregatedData))
    })
  } else {
    console.log(' Error in fetching project list: ' + response.statusCode)
  }
})

const request = require('request')
const turf = require('turf')
const queue = require('d3-queue').queue
const q = queue(20)

var aggregatedData = {}
// fetch all projects
var options = {
  url: 'https://tasks.hotosm.org/api/v1/project/search',
  headers: {
    'Accept': 'application/json',
    'Accept-Language': 'en'
  }
}

request(options, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var data = JSON.parse(body)
    data.mapResults.features.forEach(function (project) {
      // console.log(project.properties.projectId)
      q.defer(function (callback) {
        // console.log('SETTING OPTIONS FOR: ', project.properties.projectId)
        var projectOptions = {
          url: 'https://tasks.hotosm.org/api/v1/project/' + project.properties.projectId + '?as_file=false',
          headers: {
            'Accept': 'application/json',
            'Accept-Language': 'en'
          }
        }
        request(projectOptions, function (error, response, body) {
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
      var area = 0;
      results.forEach(function (project) {
        project = JSON.parse(project)
        var feature = {
          "type": "Feature",
          "properties": {}
        }
        feature["geometry"] = project["areaOfInterest"]
        area = area + turf.area(feature) / 1000000
      })
      aggregatedData['totalArea'] = area
      console.log(JSON.stringify(aggregatedData))
    })
  } else {
    console.log(' Error in fetching project list: ' + response.statusCode)
  }
})

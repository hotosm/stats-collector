const request = require('request')
const turf = require('turf')
const queue = require('d3-queue').queue
const q = queue(100)
const fs = require('fs')
const adminBoundaries = require('./countries.json')
var aggregatedData = {}
var options = {
  headers: {
    'Accept': 'application/json',
    'Accept-Language': 'en'
  }
}

// fetch home-stats
options.url = 'https://tasks-stage.hotosm.org/api/v1/stats/home-page'
request(options, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var data = JSON.parse(body)
    aggregatedData['mappersOnline'] = data['mappersOnline']
    aggregatedData['totalTasksMapped'] = data['tasksMapped']
    aggregatedData['totalMappers'] = data['totalMappers']
  }
})

// fetch all projects
options.url = 'https://tasks-stage.hotosm.org/api/v1/project/search'
request(options, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var data = JSON.parse(body)
    data.mapResults.features.forEach(function (project) {
      q.defer(function (callback) {
        options.url = 'https://tasks-stage.hotosm.org/api/v1/project/' + project.properties.projectId + '?as_file=false'
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

      results.forEach(project => {
        project = JSON.parse(project)
        var isInside = false
        var feature = {
          'type': 'Feature',
          'properties': {}
        }
        feature['geometry'] = project['areaOfInterest']
        area = area + turf.area(feature) / 1000000
        var projectCentroid = turf.centroid(feature['geometry'])
        adminBoundaries.features.forEach(boundary => {
          isInside = turf.inside(projectCentroid, boundary)
          if (isInside) {
            if (!aggregatedData[boundary.properties['NAME_EN']]) {
              aggregatedData[boundary.properties['NAME_EN']] = []
              aggregatedData[boundary.properties['NAME_EN']].push(project.projectId)
            } else {
              aggregatedData[boundary.properties['NAME_EN']].push(project.projectId)
            }
          }
        })
      })
      aggregatedData['totalArea'] = area
      fs.writeFileSync('aggregatedStats.json', JSON.stringify(aggregatedData), function (err) {
        if (err) throw err
        console.log('Saved!')
        aggregatedData = {}
      })
    })
  } else {
    console.log(' Error in fetching project list: ' + response.statusCode)
  }
})

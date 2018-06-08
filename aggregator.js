const request = require('request')
const turf = require('turf')
const queue = require('d3-queue').queue
const fs = require('fs')
const moment = require('moment')
const q = queue(100)
const adminBoundaries = require('./countries.json')
var aggregatedData = {}
var lastActive = {
  "type": "FeatureCollection",
  "features": []
}
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
        var projectCentroid = turf.centroid(project['areaOfInterest'])
        console.log('projectCentroid of ' + project.projectId + ' ' + JSON.stringify(projectCentroid))
        var currentTime = moment().format('YYYY-MM-DD[T]HH:mm:ss')
        currentTime = moment(currentTime).utc()
        var projectTime = moment.utc(project['lastUpdated'])
        var diff = currentTime.diff(projectTime, 'hours')
        if (diff <= 120) {
          projectCentroid.properties['title'] = project.projectInfo['name']
          projectCentroid.properties['id'] = project.projectId
          lastActive.features.push(projectCentroid)
        }
        feature['geometry'] = project['areaOfInterest']
        area = area + turf.area(feature) / 1000000
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
        aggregatedData = {}
      })
      fs.writeFileSync('lastActive.json', JSON.stringify(lastActive), function (err) {
        if (err) throw err
        lastActive = {}
      })
    })
  } else {
    console.log(' Error in fetching project list: ' + response.statusCode)
  }
})

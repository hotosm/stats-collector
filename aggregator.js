const request = require('request')
const queue = require('d3-queue').queue
const q = queue(20)

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
      console.log(project.properties.projectId)
      q.defer(function (callback) {
        console.log('SETTING OPTIONS FOR: ', project.properties.projectId)
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
      console.log(results)
      console.log(results.length)
    })
  } else {
    console.log(' Error in fetching project list: ' + response.statusCode)
  }
})

const request = require('request')
const queue = require('d3-queue').queue
const q = queue(10)

// fetch all projects
var options = {
  url: 'https://tasks.hotosm.org/api/v1/project/search',
  headers: {
    'Accept': 'application/json',
    'Accept-Language': 'en'
  }
}

function callback (error, response, body) {
  if (!error && response.statusCode === 200) {
    var data = JSON.parse(body)
    data.mapResults.features.forEach(function (project) {
      console.log(project.properties.projectId)
      q.defer(fetchProject, {
        projectId: project.properties.projectId
      })
    })
  } else {
    console.log(response.statusCode)
  }
}

function fetchProject (projectDetails) {
  console.log('SETTING OPTIONS FOR: ', projectDetails.projectId)
  var projectOptions = {
    url: 'https://tasks.hotosm.org/api/v1/project/' + projectDetails.projectId + '?as_file=false',
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en'
    }
  }
  request(projectOptions, projectCallback)
}

function projectCallback (error, response, body) {
  console.log('PROJECT CALLBACK')
  if (!error && response.statusCode === 200) {
    console.log('Project body: ', JSON.parse(body))
  } else {
    console.log(response.statusCode)
  }
}

request(options, callback)

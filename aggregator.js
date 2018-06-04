var request = require('request')
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
    })
  } else {
    console.log(response.statusCode)
  }
}

request(options, callback)

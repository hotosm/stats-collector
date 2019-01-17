const fs = require('fs')
const request = require('request')
const turf = require('turf')
const queue = require('d3-queue').queue
const moment = require('moment')
const AWS = require('aws-sdk')
const q = queue(100)
const adminBoundaries = require('./countries.json')
var hotosmPlayGround = 'hotosm-stats-collector'
var publicAccess = 'public-read'
var s3BodyGeoJSON
var uploadParams = {Bucket: hotosmPlayGround, Key: '', Body: '', ACL: publicAccess}
var aggregatedData = {}
var GitHub = require('github-api')
const githubOrg = 'hotosm'
const githubRepo = 'hotosm-website'
const repoBranch = 'project-pages-viz'
var activeCountries = { 'countries': [] }
var projects = {}
var campaigns = {}

// var data = ""
// var campaignsBoundaries = {
//   'type': 'FeatureCollection',
//   'features': []
// }
// var allProjects = {
//   'type': 'FeatureCollection',
//   'features': []
// }
var lastActive = {
  'type': 'FeatureCollection',
  'features': []
}
var options = {
  headers: {
    'Accept': 'application/json',
    'Accept-Language': 'en'
  }
}

// exports.handler = function index (event, context, callback) {
var api = new GithubAPI({
  token: process.env['GH_TOKEN']
})
// fetch home-stats
options.url = 'https://tasks.hotosm.org/api/v1/stats/home-page'
request(options, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var data = JSON.parse(body)
    console.log('Home page stats fetch from TM suceeded')
    aggregatedData['mappersOnline'] = data['mappersOnline']
    aggregatedData['totalTasksMapped'] = data['tasksMapped']
    aggregatedData['totalMappers'] = data['totalMappers']
  } else {
    console.error('TM: Home page stats fetch failed!')
  }
})
options.url = 'https://osm-stats-production-api.azurewebsites.net/stats/missingmaps'
request(options, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var data = JSON.parse(body)
    console.log('Home page stats fetch from MM suceeded')
    aggregatedData['totalEdits'] = data['edits']
    aggregatedData['totalBuildings'] = data['buildings']
    aggregatedData['totalRoads'] = data['roads']
  } else {
    console.log('MM: Home page stats fetch failed!')
  }
})

// fetch all projects
options.url = 'https://tasks.hotosm.org/api/v1/project/search?projectStatuses=ARCHIVED'
request(options, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var data = JSON.parse(body)
    data.mapResults.features.forEach(function (project) {
      q.defer(function (callback) {
        options.url = 'https://tasks.hotosm.org/api/v1/project/' + project.properties.projectId + '/summary'
        // console.log(options.url)
        request(options, function (error, response, body) {
          if (!error && response.statusCode === 200) {
            callback(null, body)
          } else {
            console.log('TM: Project fetch failed ' + project.properties.projectId)
          }
        })
      })
    })
    q.awaitAll(function (error, results) {
      var area = 0
      var count = 0
      var totalProjects = results.length
      aggregatedData['totalProjects'] = totalProjects
      if (error) {}
      results.forEach((project, projectCount) => {
        project = JSON.parse(project)
        var isInside = false
        projects[project.projectId] = []
        var feature = {
          'type': 'Feature',
          'properties': {}
        }
        var projectCentroid = {
          'type': 'Feature',
          'properties': {}
        }
        projects[project.projectId][0] = project.name
        projects[project.projectId][1] = project.status
        projects[project.projectId][2] = project.campaignTag
        projects[project.projectId][3] = project['created'].slice(0, 4)
        projects[project.projectId][4] = project['lastUpdated'].slice(0, 4)
        projects[project.projectId][5] = project['aoiCentroid'].coordinates
        
        // feature.properties['id'] = project.projectId
        // feature.properties['title'] = project.name
        // feature.properties['status'] = project.status
        // feature.properties['created'] = project['created'].slice(0, 4)
        // feature.properties['lastUpdated'] = project['lastUpdated'].slice(0, 4)
        projectCentroid['geometry'] = project['aoiCentroid']
        // feature['geometry'] = projectCentroid.geometry
        var currentTime = moment().format('YYYY-MM-DD[T]HH:mm:ss')
        currentTime = moment(currentTime).utc()
        var projectTime = moment.utc(project['lastUpdated'])
        var diff = currentTime.diff(projectTime, 'hours')
        if (diff <= 24) {
          projectCentroid.properties['title'] = project['name']
          projectCentroid.properties['id'] = project.projectId
          lastActive.features.push(projectCentroid)
          // feature.properties['lastActive'] = 'yes'
          projects[project.projectId][6] = 'yes'
        } else {
          // feature.properties['lastActive'] = 'no'
          projects[project.projectId][6] = 'no'
        }
   
            var hashtag = 'hotosm-project-' + project.projectId
            options.url = 'https://osm-stats-production-api.azurewebsites.net/stats/' + hashtag
            request(options, function (error, response, body) {
              if (!error && response.statusCode === 200) {
                var projectStats = JSON.parse(body)
                projects[project.projectId][7] = projectStats.changesets
                projects[project.projectId][8] = projectStats.users
                projects[project.projectId][9] = projectStats.roads
                projects[project.projectId][10] = projectStats.buildings
                projects[project.projectId][11] = projectStats.edits
                // projects[project.projectId][12] = projectStats.latest
                if (project.campaignTag){
                  if(campaigns[project.campaignTag]){
                    campaigns[project.campaignTag].push(project.projectId)
                  } else {
                    campaigns[project.campaignTag] = []
                    campaigns[project.campaignTag].push(project.projectId)
                  }
                }
                
                
                
                adminBoundaries.features.forEach(boundary => {
                  var countryName = boundary.properties['NAME_EN']
                  isInside = turf.inside(projectCentroid, boundary)
                  if (isInside) {
                    var nameLow = countryName.toLowerCase()
                    if (diff <= 24) {
                      if (activeCountries.countries.indexOf(nameLow) < 0) {
                        activeCountries.countries.push(nameLow)
                      }
                    }
                    if (!aggregatedData[countryName]) {
                      aggregatedData[countryName] = []
                      aggregatedData[countryName].push(feature)
                    } else {
                      aggregatedData[countryName].push(feature)
                    }
                  }
                })
                aggregatedData['totalArea'] = area
                count++
                
                if (count === totalProjects) uploadData(count, totalProjects)
                
              } else {
                console.log('MM: Hashtag stats fetch failed ', project.projectId)
                count++
                if (count === totalProjects) uploadData(count, totalProjects)
              }
            })
         
      })
    })
  } else {
    console.log('TM: Error in fetching project list: ' + response.statusCode)
  }
})

function uploadData (count, totalProjects) {
  if (count === totalProjects) {
    console.log('Uploading to S3')
    s3BodyGeoJSON = JSON.stringify(projects)
    uploadParams.Body = s3BodyGeoJSON
    uploadParams.Key = 'allProjects-minified.json'
    uploadToCloud(uploadParams)
    uploadParams.Body = JSON.stringify(activeCountries)
    uploadParams.Key = 'activeCountries.json'
    uploadToCloud(uploadParams)
    // s3BodyGeoJSON = JSON.stringify(allProjects)
    // uploadParams.Body = s3BodyGeoJSON
    // uploadParams.Key = 'allProjects.json'
    // uploadToCloud(uploadParams)
    s3BodyGeoJSON = JSON.stringify(lastActive)
    uploadParams.Body = s3BodyGeoJSON
    uploadParams.Key = 'lastActive.json'
    uploadToCloud(uploadParams)
    s3BodyGeoJSON = JSON.stringify(aggregatedData)
    uploadParams.Body = s3BodyGeoJSON
    uploadParams.Key = 'aggregatedStats.json'
    uploadToCloud(uploadParams)
    s3BodyGeoJSON = JSON.stringify(campaigns)
    uploadParams.Body = s3BodyGeoJSON
    uploadParams.Key = 'campaign-match.json'
    uploadToCloud(uploadParams)
    // s3BodyGeoJSON = JSON.stringify(campaigns)
    // uploadParams.Body = s3BodyGeoJSON
    // uploadParams.Key = 'campaigns-centroids.json'
    // uploadToCloud(uploadParams)
    // s3BodyGeoJSON = JSON.stringify(campaignsBoundaries)
    // uploadParams.Body = s3BodyGeoJSON
    // uploadParams.Key = 'campaigns-boundaries.json'
    // uploadToCloud(uploadParams)
    // api.setRepo(githubOrg, githubRepo)
    // api.setBranch(repoBranch)
    //   .then(() => api.pushFiles('lambda generated files at ' +
    //   moment().format('YYYY-MM-DD[T]HH:mm:ss'),
    //   [
    //     {content: JSON.stringify(activeCountries), path: 'activeCountries.json'},
    //     {content: JSON.stringify(allProjects), path: 'allProjects.json'},
    //     {content: JSON.stringify(lastActive), path: 'lastActive.json'},
    //     {content: JSON.stringify(aggregatedData), path: 'aggregatedStats.json'}
    //   ])
    //   )
    //   .then(function () {
    //     console.log('Files committed to Github!')
    //   })
  }
}
function uploadToCloud (params) {
  var s3bucket = new AWS.S3(params)
  s3bucket.upload(params, function (err) {
    if (err) {
      console.log('Error uploading data: ', err)
    } else {
      console.log('Successfully uploaded data to ' + params.Key)
    }
  })
}

function GithubAPI (auth) {
  let repo
  let filesToCommit = []
  let currentBranch = {}
  let newCommit = {}
  this.gh = new GitHub(auth)
  this.setRepo = function (userName, repoName) {
    repo = this.gh.getRepo(userName, repoName)
  }
  this.setBranch = function (branchName) {
    return repo.listBranches()
      .then((branches) => {
        let branchExists = branches.data
          .find(branch => branch.name === branchName)
        if (!branchExists) {
          return repo.createBranch('master', branchName)
            .then(() => {
              currentBranch.name = branchName
            })
        } else {
          currentBranch.name = branchName
        }
      })
  }
  this.pushFiles = function (message, files) {
    return getCurrentCommitSHA()
      .then(getCurrentTreeSHA)
      .then(() => createFiles(files))
      .then(createTree)
      .then(() => createCommit(message))
      .then(updateHead)
      .catch((e) => {
        console.error(e)
      })
  }
  function getCurrentCommitSHA () {
    return repo.getRef('heads/' + currentBranch.name)
      .then((ref) => {
        currentBranch.commitSHA = ref.data.object.sha
      })
  }
  function getCurrentTreeSHA () {
    return repo.getCommit(currentBranch.commitSHA)
      .then((commit) => {
        currentBranch.treeSHA = commit.data.tree.sha
      })
  }
  function createFiles (files) {
    let promises = []
    let length = files.length
    for (let i = 0; i < length; i++) {
      promises.push(createFile(files[i]))
    }
    return Promise.all(promises)
  }
  function createFile (file) {
    return repo.createBlob(file.content)
      .then((blob) => {
        filesToCommit.push({
          sha: blob.data.sha,
          path: file.path,
          mode: '100644',
          type: 'blob'
        })
      })
  }
  function createTree () {
    return repo.createTree(filesToCommit, currentBranch.treeSHA)
      .then((tree) => {
        newCommit.treeSHA = tree.data.sha
      })
  }
  function createCommit (message) {
    return repo.commit(currentBranch.commitSHA, newCommit.treeSHA, message)
      .then((commit) => {
        newCommit.sha = commit.data.sha
      })
  }
  function updateHead () {
    return repo.updateHead(
      'heads/' + currentBranch.name,
      newCommit.sha
    )
  }
};

//   callback(null, aggregatedData)
// }

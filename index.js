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
const repoBranch = 'gh-pages'
var activeCountries = { 'countries': [] }
var allProjects = {
  'type': 'FeatureCollection',
  'features': []
}
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

exports.handler = function index (event, context, callback) {
  var api = new GithubAPI({
    token: process.env['GH_TOKEN']
  })
  // fetch home-stats
  options.url = 'https://tasks.hotosm.org/api/v1/stats/home-page'
  request(options, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      var data = JSON.parse(body)
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
      aggregatedData['totalEdits'] = data['edits']
      aggregatedData['totalBuildings'] = data['buildings']
      aggregatedData['totalRoads'] = data['roads']
    } else {
      console.log('MM: Home page stats fetch failed!')
    }
  })

  // fetch all projects
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
            } else {
              console.log('TM: Project fetch failed for: ' + project.properties.projectId)
            }
          })
        })
      })
      q.awaitAll(function (error, results) {
        if (error) {}
        var area = 0
        var totalProjects = results.length
        aggregatedData['totalProjects'] = totalProjects
        results.forEach((project, projectCount) => {
          project = JSON.parse(project)

          var isInside = false
          var feature = {
            'type': 'Feature',
            'properties': {}
          }
          var projectCentroid = turf.centroid(project['areaOfInterest'])
          var currentTime = moment().format('YYYY-MM-DD[T]HH:mm:ss')
          currentTime = moment(currentTime).utc()
          var projectTime = moment.utc(project['lastUpdated'])
          var diff = currentTime.diff(projectTime, 'hours')
          if (diff <= 24) {
            projectCentroid.properties['title'] = project.projectInfo['name']
            projectCentroid.properties['id'] = project.projectId
            lastActive.features.push(projectCentroid)
            feature.properties['lastActive'] = 'yes'
          } else {
            feature.properties['lastActive'] = 'no'
          }
          feature['geometry'] = project['areaOfInterest']
          var projectArea = turf.area(feature) / 1000000
          area = area + projectArea
          feature['geometry'] = projectCentroid.geometry
          feature.properties['title'] = project.projectInfo['name']
          feature.properties['id'] = project.projectId
          feature.properties['area'] = projectArea
          feature.properties['year'] = project['lastUpdated'].slice(0, 4)
          feature.properties['lastUpdated'] = project['lastUpdated']
          var hashtag = project['changesetComment'].split(' ')[0].slice(1)
          options.url = 'https://osm-stats-production-api.azurewebsites.net/stats/' + hashtag
          request(options, function (error, response, body) {
            if (!error && response.statusCode === 200) {
              var projectStats = JSON.parse(body)
              feature.properties['changesets'] = projectStats.changesets
              feature.properties['mappers'] = projectStats.users
              feature.properties['roads'] = projectStats.roads
              feature.properties['buildings'] = projectStats.buildings
              feature.properties['edits'] = projectStats.edits
              feature.properties['latest'] = projectStats.latest
              allProjects.features.push(feature)
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
              if (projectCount === totalProjects - 1) {
                uploadParams.Body = JSON.stringify(activeCountries)
                uploadParams.Key = 'activeCountries.json'
                uploadToCloud(uploadParams)
                s3BodyGeoJSON = JSON.stringify(allProjects)
                uploadParams.Body = s3BodyGeoJSON
                uploadParams.Key = 'allProjects.json'
                uploadToCloud(uploadParams)
                s3BodyGeoJSON = JSON.stringify(lastActive)
                uploadParams.Body = s3BodyGeoJSON
                uploadParams.Key = 'lastActive.json'
                uploadToCloud(uploadParams)
                s3BodyGeoJSON = JSON.stringify(aggregatedData)
                uploadParams.Body = s3BodyGeoJSON
                uploadParams.Key = 'aggregatedStats.json'
                uploadToCloud(uploadParams)
                api.setRepo(githubOrg, githubRepo)
                api.setBranch(repoBranch)
                  .then(() => api.pushFiles('lambda generated files at ' +
                  moment().format('YYYY-MM-DD[T]HH:mm:ss'),
                  [
                    {content: JSON.stringify(lastActive), path: 'lastActive.json'},
                    {content: JSON.stringify(aggregatedData), path: 'aggregatedStats.json'}
                  ])
                  )
                  .then(function () {
                    console.log('Files committed to Github!')
                  })
              }
            } else {
              console.log('MM: Changeset stats failed!')
            }
          })
        })
      })
    } else {
      console.log('TM: Error in fetching project list: ' + response.statusCode)
    }
  })
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

  callback(null, aggregatedData)
}

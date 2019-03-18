const cf = require('@mapbox/cloudfriend');


const lambda = new cf.shortcuts.ScheduledLambda({
  LogicalName: 'MyLambda',
  Code: {
    S3Bucket: 'hotosm-stats-collector',
    S3Key: 'code.zip'
  },
  ScheduleExpression: 'rate(1 hour)'
});

module.exports = cf.merge(lambda);
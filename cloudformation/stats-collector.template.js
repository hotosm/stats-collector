const cf = require('@mapbox/cloudfriend');


const lambda = new cf.shortcuts.ScheduledLambda({
  LogicalName: 'MyLambda',
  Code: {
    S3Bucket: 'hotosm-stats-collector',
    S3Key: 'code.zip'
  },
  Statement: [
    {
      Effect: 'Allow',
      Action: [
        's3:ListBucket',
        's3:GetObject',
        's3:GetObjectAcl',
        's3:ListObjects'
      ],
      Resource: [
        'arn:aws:s3:::hotosm-stats-collector/',
        'arn:aws:s3:::hotosm-stats-collector/code.zip'
      ]
    }
  ],
  ScheduleExpression: 'rate(1 hour)'
});

module.exports = cf.merge(lambda);

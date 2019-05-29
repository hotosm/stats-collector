const cf = require('@mapbox/cloudfriend');


const Parameters = {
  GitSha: {
    Type: 'String'
  }
};

const lambda = new cf.shortcuts.ScheduledLambda({
  LogicalName: 'MyLambda',
  Code: {
    S3Bucket: 'stork-us-east-1',
    S3Key: cf.sub('bundles/stats-collector/${GitSha}.zip')
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
        'arn:aws:s3:::stork-us-east-1/',
        cf.sub('arn:aws:s3:::stork-us-east-1/bundles/${GitSha}')
      ]
    }
  ],
  Timeout: 900,
  MemorySize: 1024,
  ScheduleExpression: 'rate(1 hour)'
});

module.exports = cf.merge( { Parameters }, lambda );

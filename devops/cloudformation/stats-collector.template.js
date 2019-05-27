const cf = require('@mapbox/cloudfriend');


const Parameters = {
  GitSha: {
    Type: 'String'
  }
};

const lambda = new cf.shortcuts.ScheduledLambda({
  LogicalName: 'MyLambda',
  Code: {
    S3Bucket: 'stork',
    S3Key: cf.sub('bundles/${GitSha}.zip')
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
        cf.sub('arn:aws:s3:::${S3Bucket}/'),
        cf.sub('arn:aws:s3:::${S3Bucket}/bundles/${GitSha}')
      ]
    }
  ],
  ScheduleExpression: 'rate(1 hour)'
});

module.exports = cf.merge( { Parameters }, lambda );

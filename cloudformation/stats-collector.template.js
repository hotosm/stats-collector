const cf = require('@mapbox/cloudfriend');


const Parameters = {
  GitSha: {
    Type: 'String'
  },
  S3Bucket: {
    Type: 'String',
    Description: 'S3Bucket containing stork bundles'
  }
};

const lambda = new cf.shortcuts.ScheduledLambda({
  LogicalName: 'MyLambda',
  Code: {
    S3Bucket: cf.ref('S3Bucket'),
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
        cf.sub('arn:aws:s3:::${S3Bucket}/',
        'arn:aws:s3:::${S3Bucket}/bundles/${GitSha}'
      ]
    }
  ],
  ScheduleExpression: 'rate(1 hour)'
});

module.exports = cf.merge(lambda);

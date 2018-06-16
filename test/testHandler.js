require('dotenv').config();
const debug = process.env.DEBUG === 'true';
const emailVcs = require('../index.js');
const assert = require('assert');
const fs = require('fs');
const mandrillApi = require('mandrill-api');
let mandrill = new mandrillApi.Mandrill(process.env.MANDRILL_API_KEY, debug);

//overload mandrill email sending
const resolver = function(resolve){
  return resolve();
};
emailVcs.mandrill.messages.send = function(request, resolver, rejecter){
  return resolver();
};

const readMandrillTemplate = async function(filename) {

  return new Promise(function(resolve, reject){

    mandrill.templates.info({
      "name": filename.replace('/', '-').slice(0, -3)
    }, function(result){

      return resolve(result);

    }, function(result){

      return reject(new Error(JSON.stringify(result)));

    });

  });

};

const convertParsedTemplateToMandrillFormat = function(filename, file) {

    const mandrillFilename = filename.replace('/', '-').slice(0, -3);

    return {
      "slug": mandrillFilename,
      "name": mandrillFilename,
      "labels": [...file['Labels']],
      "from_email": typeof file['From Email'] !== 'undefined' ? file['From Email'] : process.env.MANDRILL_DEFAULT_FROM_EMAIL,
      "from_email": typeof file['From Email'] !== 'undefined' ? file['From Email'] : process.env.MANDRILL_DEFAULT_FROM_EMAIL,
      "from_name": typeof file['From Name'] !== 'undefined' ? file['From Name'] : process.env.MANDRILL_DEFAULT_FROM_NAME,
      "subject": file['Subject'],
      "code": file['Html'],
      "text": file['Text'] !== '' ? file['Text'] : null,
      "publish_name": mandrillFilename,
      "publish_from_email": typeof file['From Email'] !== 'undefined' ? file['From Email'] : process.env.MANDRILL_DEFAULT_FROM_EMAIL,
      "publish_from_email": typeof file['From Email'] !== 'undefined' ? file['From Email'] : process.env.MANDRILL_DEFAULT_FROM_EMAIL,
      "publish_from_name": typeof file['From Name'] !== 'undefined' ? file['From Name'] : process.env.MANDRILL_DEFAULT_FROM_NAME,
      "publish_subject": file['Subject'],
      "publish_code": file['Html'],
      "publish_text": file['Text'] !== '' ? file['Text'] : null
    };

};

const removeUnusedMandrillTemplateVars = function(data){

    delete data.created_at;
    delete data.draft_updated_at;
    delete data.published_at;
    delete data.updated_at;

    return data;

};

describe('emailVcs.js', function() {

  describe('#parseMarkdown', function() {
    it('parses a markdown template', function() {

      const template = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');
      const testData = {
        'From Email': 'support@parkingmobility.com',
        'From Name': 'Parking Mobility',
        'Subject': 'Password reset request',
        'Html': '<div mc:edit=\"header\">\n    <p>*|FNAME|*,</p>\n    <p>We received a request to reset the password associated with this e-mail address.</p>\n</div>\n<div mc:edit=\"main\">\n    <p>If you made this request, to reset your password using our secure server <a href=\"https://app.parkingmobility.com/forgotpassword/*|URL|*\">please click here</a>.</p>\n    <p>If you did not request to have your password reset you can safely ignore this email. Rest assured your customer account is safe.</p>\n    <p>Parking Mobility will never e-mail you and ask you to disclose or verify your password or any other personal information. If you receive a suspicious e-mail with a link to update your account information, do not click on the link. Instead, please send us an email at support@parkingmobility.com.</p>\n    <br/>\n</div>\n<div mc:edit=\"footer\">\nAccessibly yours,<br/>\nThe Parking Mobility Team\n</div>',
        'Labels': ['changepassword'],
        'Text': ''
      };
      const parsedData = emailVcs.parseMarkdown(template);
      assert.deepEqual(testData, parsedData);

    });
  });

  describe('#upsertMandrillTemplate', function() {
    it('adds a template to mandrill', async function() {

      const filename = 'test/email-vcs-template.md';
      const fileContents = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');
      const parsedFile = emailVcs.parseMarkdown(fileContents);

      //add to mandrill
      await emailVcs.upsertMandrillTemplate(filename, parsedFile);

      //read from mandrill
      let mandrillFile = await readMandrillTemplate(filename);
      mandrillFile = removeUnusedMandrillTemplateVars(mandrillFile);
      mandrillFile.labels.sort();

      //convert format for comparison
      let parsedFileAsMandrill = convertParsedTemplateToMandrillFormat(filename, parsedFile);
      parsedFileAsMandrill.labels.sort();

      //verify
      assert.deepEqual(mandrillFile, parsedFileAsMandrill);

      //clean up after ourselves
      await emailVcs.removeMandrillTemplate(filename);

    });

    it('modifies a template in mandrill', async function() {

      const filename = 'test/email-vcs-template.md';
      const fileContents = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');
      const parsedFile = emailVcs.parseMarkdown(fileContents);

      //add to mandrill
      await emailVcs.upsertMandrillTemplate(filename, parsedFile);
      parsedFile['Subject'] += ' - Modified';

      //modify in mandrill
      await emailVcs.upsertMandrillTemplate(filename, parsedFile);

      //read from mandrill
      let mandrillFile = await readMandrillTemplate(filename);
      mandrillFile = removeUnusedMandrillTemplateVars(mandrillFile);
      mandrillFile.labels.sort();

      //convert format for comparison
      let parsedFileAsMandrill = convertParsedTemplateToMandrillFormat(filename, parsedFile);
      parsedFileAsMandrill.labels.sort();

      //verify
      assert.deepEqual(mandrillFile, parsedFileAsMandrill);

      //clean up after ourselves
      await emailVcs.removeMandrillTemplate(filename);

    });

    it('rejects upserting an invalid template to mandrill', async function() {

      const filename = '.md';
      const file = {
        'Subject': 'test-invalid-mandrill-template',
        'Html': '',
        'Text': '',
        'Labels': []
      };

      try {
        await emailVcs.upsertMandrillTemplate(filename, file);
      }
      catch(e) {
        assert.equal(e.message, 'Unable to sync file: ');
      }

    });
  });

  describe('#removeMandrillTemplates', function() {
    it('removes a template from mandrill', async function() {

      const filename = 'test/email-vcs-template.md';
      const fileContents = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');
      const parsedFile = emailVcs.parseMarkdown(fileContents);

      //upsert to mandrill then assert that it's there before deleting
      await emailVcs.upsertMandrillTemplate(filename, parsedFile);

      //read from mandrill
      let mandrillFile = await readMandrillTemplate(filename);
      mandrillFile = removeUnusedMandrillTemplateVars(mandrillFile);
      mandrillFile.labels.sort();

      //convert format for comparison
      let parsedFileAsMandrill = convertParsedTemplateToMandrillFormat(filename, parsedFile);
      parsedFileAsMandrill.labels.sort();

      //verify
      assert.deepEqual(mandrillFile, parsedFileAsMandrill);

      //remove from mandrill then verify it's been deleted
      await emailVcs.removeMandrillTemplate(filename);

      try {
        await readMandrillTemplate(filename);
      }
      catch(e) {
        assert.deepEqual(JSON.parse(e.message), {
          'status': 'error',
          'code': 5,
          'name': 'Unknown_Template',
          'message': 'No such template "test-email-vcs-template"'
        });
      }

    });

    it('rejects when attempting to remove an invalid template from mandrill', async function() {

      const filename = 'test/email-vcs-template-doesnt-exist.md';

      try {
        await emailVcs.removeMandrillTemplate(filename);
      }
      catch(e) {
        assert.equal(e.message, 'Unable to remove file: test-email-vcs-template-doesnt-exist');
      }

    });
  });

  describe('#getMandrillFilename', function() {
    it('converts a filename to mandrill template filename format', async function() {

      //sync to mandrill
      const filename = 'test/template.md';
      const mandrillFilename = await emailVcs.getMandrillFilename(filename);

      //verify
      assert.equal(mandrillFilename, 'test-template');

    });
  });

  describe('#syncMandrill', function() {
    it('syncs a file from github to mandrill', async function() {

      //sync to mandrill
      const filename = 'test/template.md';
      await emailVcs.syncMandrill([filename]);

      //read from mandrill
      const fileContents = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');
      const parsedFile = emailVcs.parseMarkdown(fileContents);
      let mandrillFile = await readMandrillTemplate(filename);
      mandrillFile = removeUnusedMandrillTemplateVars(mandrillFile);
      mandrillFile.labels.sort();

      //convert format for comparison
      let parsedFileAsMandrill = convertParsedTemplateToMandrillFormat(filename, parsedFile);
      parsedFileAsMandrill.labels.sort();

      //verify
      assert.deepEqual(mandrillFile, parsedFileAsMandrill);

      //clean up after ourselves
      await emailVcs.removeMandrillTemplate(filename);

    });

    it('rejects sync of an invalid file from github to mandrill', async function() {

      //sync to mandrill
      const filename = 'test/template-does-not-exist.md';

      try {
        await emailVcs.syncMandrill([filename]);
      }
      catch(e) {
        assert.equal(e.message, 'Unable to remove file: test-template-does-not-exist');
      }

    });
  });

  describe('#removeDuplicateFiles', function() {
    it('remove duplicate files once converted to mandrill name format', async function() {

      const files = [
        'test/template.md',
        'test-template.md'
      ];

      const cleanedFiles = await emailVcs.removeDuplicateFiles(files);

      const expectedFiles = [
        'test/template.md'
      ];

      //verify
      assert.deepEqual(cleanedFiles, expectedFiles);

      emailVcs.syncErrors = [];

    });

    it('errors on duplicate filenames once converted to mandrill name format', async function() {

      const files = [
        'test/template.md',
        'test-template.md',
        'test/template2.md'
      ];

      await emailVcs.removeDuplicateFiles(files);

      //verify
      assert.deepEqual(emailVcs.syncErrors, ['test-template.md causes duplication once converted to test-template']);

      emailVcs.syncErrors = [];

    });

  });

  describe('#getAllFilesFromGithub', function() {
    it('gets directory listing from github', async function() {

      const files = await emailVcs.getAllFilesFromGithub();

      assert.ok(typeof files === 'object' && files.indexOf('test/template.md') !== -1);

    });
  });

  describe('#getFileContentsFromGithub', function() {
    it('reads the contents of a file from github', async function() {

      const file = 'test/template.md';
      const githubFileContents = await emailVcs.getFileContentsFromGithub(file);
      const mockFileContents = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');

      assert.equal(githubFileContents.data, mockFileContents);

    });
  });

  describe('#signRequestBody', function() {
    it('generates a request signature', function() {

      delete require.cache[require.resolve('./mocks/githubPushEvent.json')];
      let event = require('./mocks/githubPushEvent.json');
      const signature = event.headers['X-Hub-Signature'];
      const calculatedSig = emailVcs.signRequestBody(process.env.GITHUB_WEBHOOK_SECRET, event.body);

      assert.equal(signature, calculatedSig);

    });
  });

  describe('#getFileDiff', function() {
    it('sorts files changed by type', function() {

      const commits = [{
        "added": ["test/added1.md"],
        "removed": ["test/removed1.md"],
        "modified": ["test/modified1.md"]
      },
      {
        "added": ["test/added2.md"],
        "removed": ["test/removed2.md"],
        "modified": ["test/modified2.md"]
      }];

      const expectedDiff = {
        "added": [
          "test/added1.md",
          "test/added2.md"
        ],
        "modified": [
          "test/modified1.md",
          "test/modified2.md"
        ],
        "removed": [
          "test/removed1.md",
          "test/removed2.md"
        ]
      };

      const diff = emailVcs.getFileDiff(commits);

      assert.deepEqual(diff, expectedDiff);

    });
  });

  describe('#sendNotification', function() {
    it('notifies diff on sync', async function() {

      const syncErrors = [];
      const syncActions = {
        added: [],
        modified: ['test/template.md'],
        removed: []
      };

      const notification = await emailVcs.sendNotification(syncActions, syncErrors);
      const expectedNotification = '<html><body>ThefollowingfileshavebeensyncedfromyourGithubrepo"PM-email-templates"toMandrill:<br/><br/><strong>Added:</strong><br/>None<br/><br/><br/><strong>Modified:</strong><br/><ahref="https://github.com/coalharbourgroup/PM-email-templates/blob/master/test/template.md">test/template.md</a><br/><br/><strong>Removed:</strong><br/>None<br/><br/><br/><br/><strong>Errors:</strong><br/>None</body></html>';

      assert.equal(notification.replace(/\s/g,''), expectedNotification.replace(/\s/g,''));

    });

    it('notifies of sync errors', async function() {

      const syncErrors = ['Test Sync Error'];
      const syncActions = {
        added: [],
        modified: ['test/template.md'],
        removed: []
      };

      const notification = await emailVcs.sendNotification(syncActions, syncErrors);
      const expectedNotification = '<html><body>ThefollowingfileshavebeensyncedfromyourGithubrepo"PM-email-templates"toMandrill:<br/><br/><strong>Added:</strong><br/>None<br/><br/><br/><strong>Modified:</strong><br/><ahref="https://github.com/coalharbourgroup/PM-email-templates/blob/master/test/template.md">test/template.md</a><br/><br/><strong>Removed:</strong><br/>None<br/><br/><br/><br/><strong>Errors:</strong><br/>TestSyncError</body></html>';

      assert.equal(notification.replace(/\s/g,''), expectedNotification.replace(/\s/g,''));

    });

    it('rejects on failed sync notification', async function(){

      const originalSender =  emailVcs.mandrill.messages.send;
      //overload mandrill email sending
      const resolver = function(resolve){
        return resolve();
      };
      const rejecter = function(reject, e){
        return reject(Error(e))
      };
      emailVcs.mandrill.messages.send = function(request, resolver, rejecter){
        return rejecter('rejected');
      };

      const syncErrors = ['Test Sync Error'];
      const syncActions = {
        added: [],
        modified: ['test/template.md'],
        removed: []
      };

      try {
        await await emailVcs.sendNotification(syncActions, syncErrors);
      }
      catch(e) {
        assert.equal(e, 'Unable to send notification via mandrill: "rejected"');
      }

      emailVcs.mandrill.messages.send = originalSender;

    });
  });


  describe('#handler', async function() {
    it('uploads a test file from a push event', async function() {

      delete require.cache[require.resolve('./mocks/githubPushEvent.json')];
      let event = require('./mocks/githubPushEvent.json');

      await emailVcs.handler(event, {}, async function(e, response){

        //read from mandrill
        const filename = 'test/template.md'
        const fileContents = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');
        const parsedFile = emailVcs.parseMarkdown(fileContents);
        let mandrillFile = await readMandrillTemplate(filename);
        mandrillFile = removeUnusedMandrillTemplateVars(mandrillFile);
        mandrillFile.labels.sort();

        //convert format for comparison
        let parsedFileAsMandrill = convertParsedTemplateToMandrillFormat(filename, parsedFile);
        parsedFileAsMandrill.labels.sort();

        //verify
        assert.deepEqual(mandrillFile, parsedFileAsMandrill);

        //clean up after ourselves
        await emailVcs.removeMandrillTemplate(filename);

      });

    });

    it('processes correct action (modify) from a push event with multiple commits', async function() {

      delete require.cache[require.resolve('./mocks/githubModifyMultiCommitPushEvent.json')];
      let event = require('./mocks/githubModifyMultiCommitPushEvent.json');

      // add file to mandrill
      const filename = 'test/template.md';
      const fileContents = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');
      const parsedFile = emailVcs.parseMarkdown(fileContents);
      await emailVcs.upsertMandrillTemplate(filename, parsedFile);

      //process push event to modify
      await emailVcs.handler(event, {}, async function(e, response){

        //read from mandrill
        const fileContents = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');
        const parsedFile = emailVcs.parseMarkdown(fileContents);
        let mandrillFile = await readMandrillTemplate(filename);
        mandrillFile = removeUnusedMandrillTemplateVars(mandrillFile);
        mandrillFile.labels.sort();

        //convert format for comparison
        let parsedFileAsMandrill = convertParsedTemplateToMandrillFormat(filename, parsedFile);
        parsedFileAsMandrill.labels.sort();

        //verify
        assert.deepEqual(mandrillFile, parsedFileAsMandrill);

        //clean up after ourselves
        await emailVcs.removeMandrillTemplate(filename);

      });

    });

    it('processes correct action (remove) from a push event with multiple commits', async function() {

      delete require.cache[require.resolve('./mocks/githubRemoveMultiCommitPushEvent.json')];
      let event = require('./mocks/githubRemoveMultiCommitPushEvent.json');

      // add file to mandrill
      const filename = 'test/delete-me.md';
      const fileContents = fs.readFileSync(__dirname + '/mocks/template.md', 'utf8');
      const parsedFile = emailVcs.parseMarkdown(fileContents);
      await emailVcs.upsertMandrillTemplate(filename, parsedFile);

      //process push event to remove
      await emailVcs.handler(event, {}, async function(e, response){

        try {
          await readMandrillTemplate(filename);
        }
        catch(e) {
          assert.deepEqual(JSON.parse(e.message), {
            'status': 'error',
            'code': 5,
            'name': 'Unknown_Template',
            'message': 'No such template "test-delete-me"'
          });
        }

      });

    });

    it('fails without a github token', async function() {

      delete require.cache[require.resolve('./mocks/githubPushEvent.json')];
      let event = require('./mocks/githubPushEvent.json');
      const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
      delete process.env.GITHUB_WEBHOOK_SECRET;

      await emailVcs.handler(event, {}, async function(e, response){

        assert.equal(response.body, 'Must provide a \'GITHUB_WEBHOOK_SECRET\' env variable');

        process.env.GITHUB_WEBHOOK_SECRET = GITHUB_WEBHOOK_SECRET;

      });

    });

    it('fails without a signature', async function() {

      delete require.cache[require.resolve('./mocks/githubPushEvent.json')];
      let event = require('./mocks/githubPushEvent.json');
      delete event.headers['X-Hub-Signature'];

      await emailVcs.handler(event, {}, async function(e, response){

        assert.equal(response.body, 'No X-Hub-Signature found on request');

      });

    });

    it('fails without a github event', async function() {

      delete require.cache[require.resolve('./mocks/githubPushEvent.json')];
      let event = require('./mocks/githubPushEvent.json');
      delete event.headers['X-GitHub-Event'];

      await emailVcs.handler(event, {}, async function(e, response){

        assert.equal(response.body, 'No X-Github-Event found on request');

      });

    });

    it('fails without a github delivery', async function() {

      delete require.cache[require.resolve('./mocks/githubPushEvent.json')];
      let event = require('./mocks/githubPushEvent.json');
      delete event.headers['X-GitHub-Delivery'];

      await emailVcs.handler(event, {}, async function(e, response){

        assert.equal(response.body, 'No X-Github-Delivery found on request');

      });

    });

    it('fails with an invalid signature', async function() {

      delete require.cache[require.resolve('./mocks/githubPushEvent.json')];
      let event = require('./mocks/githubPushEvent.json');
      event.headers['X-Hub-Signature'] = '123';

      await emailVcs.handler(event, {}, async function(e, response){

        assert.equal(response.body, 'X-Hub-Signature incorrect. Github webhook token doesn\'t match');

      });

    });

    it('skips with an invalid ref', async function() {

      delete require.cache[require.resolve('./mocks/githubInvalidRefPushEvent.json')];
      let event = require('./mocks/githubInvalidRefPushEvent.json');

      await emailVcs.handler(event, {}, async function(e, response){

        assert.equal(response.headers.processed, 0);

      });

    });
  });

});
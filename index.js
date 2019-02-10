/**
 * Sync templates from Github to Mandrill
 */
const debug = process.env.DEBUG === 'true';
const async = require('async');
const crypto = require('crypto');
const mandrillApi = require('mandrill-api');
let mandrill = new mandrillApi.Mandrill(process.env.MANDRILL_API_KEY, debug);
const octokit = require('@octokit/rest')({
  debug: debug,
  auth: `token ${process.env.GITHUB_API_TOKEN}`
});

module.exports = (function(){

  const emailVcs = {

    mandrill: mandrill,

    syncActions: {
      added: [],
      modified: [],
      removed: []
    },

    syncErrors: [],

    /**
     * Converts a regular filename to a Mandrill Template formatted filename
     *
     * @param {String} filename
     */
    getMandrillFilename: function(filename) {

      return filename.replace('/', '-').slice(0, -3);

    },

    /**
     * Sync all files to Mandrill
     *
     * @param {Array} array of touched files
     */
    syncMandrill: async function(files){

      return new Promise(function(resolve, reject){

        async.each(files, async function(filename){

          try {
            const fileContents = await emailVcs.getFileContentsFromGithub(filename);
            const parsedFile = emailVcs.parseMarkdown(fileContents.data);
            return await emailVcs.upsertMandrillTemplate(filename, parsedFile);
          }
          catch(e) {
            if (typeof e.code !== 'undefined' && e.code === 404) {
              return await emailVcs.removeMandrillTemplate(filename);
            }
          }

        }, function(err){

          if (err) {
            reject(err);
          }
          else {
            resolve();
          }

        });

      });

    },

    /**
     * Removes files that will be duplicates once converted to mandrill template name format
     *
     * @param {Array} array of touched files
     */
    removeDuplicateFiles: async function(files){

      const filesFromGithub = await emailVcs.getAllFilesFromGithub();
      const formattedFilenames = filesFromGithub.map(function(filename){
        return filename.replace('/', '-').slice(0, -3);
      });

      //remove duplicates and clone files array
      let deduplicatedFiles = files.filter(function(filename, pos){
        return files.indexOf(filename) === pos;
      }).slice();

      for (let i=0; i<deduplicatedFiles.length; i++) {

        const filename = deduplicatedFiles[i];
        const mandrillFilename = emailVcs.getMandrillFilename(filename);
        const occurances = formattedFilenames.filter(function(occuranceFilename){
          return occuranceFilename === mandrillFilename;
        });

        if (occurances.length > 1) {

          emailVcs.syncErrors.push(filename + ' causes duplication once converted to ' + mandrillFilename);
          deduplicatedFiles.splice(deduplicatedFiles.indexOf(filename), 1);

        }

        formattedFilenames.push(mandrillFilename);

      };

      return deduplicatedFiles;

    },

    /**
     * Get array of files to diff by type
     *
     * @param {Object} files by type
     */
    getFileDiff: function(commits){

      //sort changed files
      let filesTouchedByChange = {
        added: [],
        modified: [],
        removed: []
      };

      //sort and filter duplicates
      commits.forEach(function(commit){

        ['added', 'modified', 'removed'].forEach(function(type){

          commit[type].forEach(function(file){

            if (filesTouchedByChange[type].indexOf(file) === -1) {
              filesTouchedByChange[type].push(file);
            }

          });

        });

      });

      return filesTouchedByChange;

    },

    /**
     * Sends a notification of the diff of changes that were made
     *
     * @param {Array} commits
     */
    sendNotification: async function(syncActions, syncErrors){

      return new Promise(async function(resolve, reject){

        const getFileChangeOutput = async function(files){

          if (files.length === 0) {
            return 'None<br />';
          }

          const lines = await Promise.all(files.map(async function(file){
              try {
                const fileContents = await emailVcs.getFileContentsFromGithub(file, false);
                return `<a href="${await fileContents.data.html_url}">${file}</a>`;
              }
              catch(e) {
                return `${file} (Removed)`;
              }
            }));

          return lines.join('<br />');

        };

        const output = `<html><body>
The following files have been synced from your Github repo "${process.env.GITHUB_TEMPLATE_REPO}" to Mandrill:
<br /><br />
<strong>Added:</strong><br />
${await getFileChangeOutput(syncActions.added)}
<br /><br />

<strong>Modified:</strong><br />
${await getFileChangeOutput(syncActions.modified)}
<br /><br />

<strong>Removed:</strong><br />
${await getFileChangeOutput(syncActions.removed)}
<br /><br /><br />

<strong>Errors:</strong><br />
${syncErrors.length === 0 ? 'None' : syncErrors.join('<br />')}

</body></html>`;

        const message = {
          "from_email": process.env.MANDRILL_DEFAULT_FROM_EMAIL,
          "from_name": process.env.MANDRILL_DEFAULT_FROM_EMAIL,
          "to": process.env.NOTIFY_EMAILS.split(',').map(function(email){
            return {
              "email": email.trim(),
              "type": "to"
            };
          }),
          "subject": 'EmailVCS Sync Notification for ' + process.env.GITHUB_TEMPLATE_REPO,
          "html": output
        };

        emailVcs.mandrill.messages.send({"message": message}, function(result) {

          resolve(output);

        }, function(e) {

          reject('Unable to send notification via mandrill: ' + JSON.stringify(e));

        });

      });

    },

    /**
     * Upsert templates to Mandrill
     *
     * @param {String} filename
     * @param {Object} parsed file
     */
    upsertMandrillTemplate: async function(filename, file){

      const mandrillFilename = emailVcs.getMandrillFilename(filename);

      return new Promise(function(resolve, reject){

        const templateData = {
          "slug": mandrillFilename,
          "name": mandrillFilename,
          "labels": [...file['Labels']],
          "from_email": typeof file['From Email'] !== 'undefined' ? file['From Email'] : process.env.MANDRILL_DEFAULT_FROM_EMAIL,
          "from_email": typeof file['From Email'] !== 'undefined' ? file['From Email'] : process.env.MANDRILL_DEFAULT_FROM_EMAIL,
          "from_name": typeof file['From Name'] !== 'undefined' ? file['From Name'] : process.env.MANDRILL_DEFAULT_FROM_NAME,
          "subject": file['Subject'],
          "code": file['Html'],
          "text": file['Text'],
          "publish": true,
          "publish_name": filename,
          "publish_from_email": typeof file['From Email'] !== 'undefined' ? file['From Email'] : process.env.MANDRILL_DEFAULT_FROM_EMAIL,
          "publish_from_email": typeof file['From Email'] !== 'undefined' ? file['From Email'] : process.env.MANDRILL_DEFAULT_FROM_EMAIL,
          "publish_from_name": typeof file['From Name'] !== 'undefined' ? file['From Name'] : process.env.MANDRILL_DEFAULT_FROM_NAME,
          "publish_subject": file['Subject'],
          "publish_code": file['Html'],
          "publish_text": file['Text']
        };

        emailVcs.mandrill.templates.update(templateData, function(result){

          emailVcs.syncActions.modified.push(filename);
          resolve(result);

        }, function(e){

          //File does not exist - add file
          emailVcs.mandrill.templates.add(templateData, function(result){

            emailVcs.syncActions.added.push(filename);
            resolve(result);

          }, function(result){

            emailVcs.syncErrors.push('Unable to sync file: ' + mandrillFilename);
            reject(new Error('Unable to sync file: ' + mandrillFilename));

          });

        });

      });

    },

    /**
     * Remove template from Mandrill
     *
     * @param {String} filename
     */
    removeMandrillTemplate: async function(filename){

      const mandrillFilename = emailVcs.getMandrillFilename(filename);

      return new Promise(function(resolve, reject){

        emailVcs.mandrill.templates.delete({
          "name": mandrillFilename
        }, function(result){

          emailVcs.syncActions.removed.push(filename);
          resolve(result);

        }, function(result){

          emailVcs.syncErrors.push('Unable to remove file: ' + mandrillFilename);
          reject(new Error('Unable to remove file: ' + mandrillFilename));

        });

      });

    },

    /**
     * Parse a markdown template
     *
     * @param {String} file contents
     * @return {Object} parsed data
     */
    parseMarkdown: function(contents){

      let data = {};
      const variables = ['Subject', 'Html', 'Text', 'Labels', 'From Email', 'From Name'];

      //extract variables
      variables.forEach(function(variable) {

        const pattern = new RegExp('#\\s' + variable + '\\s*(.*?)(#\\s\\w|$(?![\\r\\n]))', 'gsi');
        const matches = pattern.exec(contents);
        if (matches !== null && typeof matches[1] !== 'undefined') {
          data[variable] = matches[1].trim();
        }

      });

      //convert labels into an array
      data['Labels'] = data['Labels'].split("\n").map(function(label){
        return label.replace('* ', '');
      });

      return data;

    },

    /**
     * Get list of files from Github
     *
     * @return {Array} files
     */
    getAllFilesFromGithub: async function(path=''){

      let files = [];
      const githubFiles = await octokit.repos.getContents({
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_TEMPLATE_REPO,
        ref: process.env.GITHUB_SYNC_BRANCH,
        path: path,
        headers: {
          'Accept': 'application/vnd.github.VERSION.object'
        }
      });

      for (let i=0; i<githubFiles.data.entries.length; i++) {

        const file = githubFiles.data.entries[i];

        if (file.type === 'dir') {
          const subPath = path + (path.length > 0 ? '/' : '') + file.name;
          const subDirFiles = await emailVcs.getAllFilesFromGithub(subPath);

          if (typeof subDirFiles !== 'undefined') {
            files = files.concat(...subDirFiles.map(function(f){
              return subPath + '/' + f;
            }));
          }
        }
        else {
          files.push(file.name);
        }

      };

      return files;

    },

    /**
     * Get the contents of a file from Github
     *
     * @param {String} filename
     * @return {String} file contents
     */
    getFileContentsFromGithub: async function(filename, getRawContents=true){

      return octokit.repos.getContents({
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_TEMPLATE_REPO,
        ref: process.env.GITHUB_SYNC_BRANCH,
        path: filename,
        headers: {
          'Accept': getRawContents ? 'application/vnd.github.v3.raw' : 'application/vnd.github.VERSION.object'
        }
      });

    },

    /**
     * Sign a request body in Github's format
     *
     * @param {String} key
     * @param {String} body
     * @return {String} signature
     */
    signRequestBody: function(key, body){

      return `sha1=${crypto.createHmac('sha1', key).update(JSON.stringify(body), 'utf-8').digest('hex')}`;

    },

    /**
     * Sync Github file changes from a push event to Mandrill
     *
     * @param {Object} event
     * @param {Object} context
     * @param {Function} callback
     * @return {Function} callback
     */
    handler: async function(event, context, callback){

      emailVcs.syncActions = {
        added: [],
        modified: [],
        removed: []
      };
      emailVcs.syncErrors = [];
      let errMsg = '';
      const token = process.env.GITHUB_WEBHOOK_SECRET;
      const headers = event.headers;
      const sig = headers['X-Hub-Signature'];
      const githubEvent = headers['X-GitHub-Event'];
      const id = headers['X-GitHub-Delivery'];
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

      if (typeof token !== 'string') {
        errMsg = 'Must provide a \'GITHUB_WEBHOOK_SECRET\' env variable';
        return callback(null, {
          statusCode: 401,
          headers: { 'Content-Type': 'text/plain' },
          body: errMsg,
        });
      }

      if (!sig) {
        errMsg = 'No X-Hub-Signature found on request';
        return callback(null, {
          statusCode: 401,
          headers: { 'Content-Type': 'text/plain' },
          body: errMsg,
        });
      }

      if (!githubEvent) {
        errMsg = 'No X-Github-Event found on request';
        return callback(null, {
          statusCode: 422,
          headers: { 'Content-Type': 'text/plain' },
          body: errMsg,
        });
      }

      if (!id) {
        errMsg = 'No X-Github-Delivery found on request';
        return callback(null, {
          statusCode: 401,
          headers: { 'Content-Type': 'text/plain' },
          body: errMsg,
        });
      }

      const calculatedSig = emailVcs.signRequestBody(token, body);
      if (sig !== calculatedSig) {
        errMsg = 'X-Hub-Signature incorrect. Github webhook token doesn\'t match';
        return callback(null, {
          statusCode: 401,
          headers: { 'Content-Type': 'text/plain' },
          body: errMsg,
        });
      }

      if (body.ref !== 'refs/heads/' + process.env.GITHUB_SYNC_BRANCH) {
        return callback(null, {
          statusCode: 203,
          headers: {
            processed: 0
          }
        });
      }

      //aggregate modified files
      let filesTouched = [];
      body.commits.forEach(function(commit){
        filesTouched = filesTouched.concat(commit.added, commit.modified, commit.removed);
      });

      //filter duplicates
      filesTouched.filter(function(v, k){
        return k === filesTouched.indexOf(v);
      });

      //remove duplicates for mandrill format
      filesTouched = await emailVcs.removeDuplicateFiles(filesTouched);

      //sync to Mandrill
      await emailVcs.syncMandrill(filesTouched);

      //notify the user of changes with diffs
      await emailVcs.sendNotification(emailVcs.syncActions, emailVcs.syncErrors);

      const response = {
        statusCode: 200,
        headers: {
          processed: filesTouched.length
        },
        body: JSON.stringify({
          input: event,
          files: filesTouched
        }),
      };

      return callback(null, response);

    }

  };

  return emailVcs;

})();
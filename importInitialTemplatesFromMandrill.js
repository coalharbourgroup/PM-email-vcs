/**
 * Import published templates from mandrill
 */
require('dotenv').config();
const mandrillApi = require('mandrill-api');
let mandrill = new mandrillApi.Mandrill(process.env.MANDRILL_API_KEY, process.env.DEBUG);
const fs = require('fs');

mandrill.templates.list(function(result){

  if (!result || result.length === 0) {
    console.error('No Mandrill templates found');
    return;
  }

  result.forEach(function(template){

    if (!template.publish_subject) {
      return;
    }

    //set labels to each part of the filename if there are none set
    if (template.labels.length === 0) {
      template.labels = template.slug.split('-');
    }

    const filename = template.slug + '.md';
    const formattedTemplate = generateMarkdown(template);

    console.log('Writing markdown to ' + filename);
    fs.writeFile(process.env.LOCAL_TEMPLATE_DIR_PATH + filename, formattedTemplate, function(){});

  });

});

function generateMarkdown(template) {

  let output = '';

  output += "# Subject \r\n";
  output += (template.publish_subject !== null ? template.publish_subject : '') + " \r\n\r\n";

  output += "# Html \r\n";
  output += (template.publish_code !== null ? template.publish_code : '') + " \r\n\r\n";

  output += "# Text \r\n";
  output += (template.publish_text !== null ? template.publish_text : '') + " \r\n\r\n";

  output += "# Labels \r\n";
  template.labels.forEach(function(label){
    output += "* " + label + " \r\n";
  });
  output += "\r\n";

  output += "# From Email \r\n";
  output += (template.publish_from_email !== null ? template.publish_from_email : '') + " \r\n\r\n";

  output += "# From Name \r\n";
  output += (template.publish_from_name !== null ? template.publish_from_name : '') + " \r\n\r\n";

  return output;

}
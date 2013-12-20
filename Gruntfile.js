/* jshint node: true */
'use strict';

var exec = require('child_process').exec;

module.exports = function(grunt){
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      files: ['*.js'],
      options: {
        jshintrc: true,
        reporterOutput: 'LINT'
      }
    }
  });


  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.registerTask('todo', 'Grep and output TODOs', function(){
    var done = this.async();

    exec('grep TODO --exclude=Gruntfile.js * >> TODOs', function(){
      exec('grep TODO views/* >> TODOs', function(){
        done();
      });
    });
  });
  grunt.registerTask('default', ['jshint', 'todo']);
};

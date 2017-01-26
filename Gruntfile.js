module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    babel: {
      options: {
          sourceMap: false,
          presets: ['es2015']
      },
      lib: {
        files: [
          {
            expand: true,
            cwd: 'src/',
            src: ['**/*.js'],
            dest: 'lib/'
          }
        ]
      }
    },
    copy: {
      test: {
        files: [
          {
            expand: true,
            cwd: 'test/qunit/',
            src: ['qunit.html', 'qunit-tests.js', 'test-audio.opus'],
            dest: 'dist/'
          }
        ]
      }
    },
    browserify: {
      dist: {
        options: {
          browserifyOptions: {
            standalone: 'StreamFile'
          },
          plugin: [
            ['browserify-derequire']
          ]
        },
        files: {
          'dist/stream-file.js': ['lib/stream-file.js']
        }
      },
      polyfill: {
        files: {
          'dist/es6-promise.js': ['lib/es6-promise.js']
        }
      }
    },
    uglify: {
      dist: {
        options: {
          sourceMap: true
        },
        files: {
          'dist/stream-file.min.js': ['dist/stream-file.js']
        }
      },
      polyfill: {
        options: {
          sourceMap: true
        },
        files: {
          'dist/es6-promise.min.js': ['dist/es6-promise.js']
        }
      }
    },
    compress: {
      dist: {
        files: {
          'dist/stream-file.min.js.gz': ['dist/stream-file.min.js']
        }
      },
      polyfill: {
        files: {
          'dist/es6-promise.min.js.gz': ['dist/es6-promise.min.js']
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-babel');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-compress');

  grunt.registerTask('default', [
    'babel',
    'copy',
    'browserify',
    'uglify',
    'compress'
  ]);

};

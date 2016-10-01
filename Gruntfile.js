module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    copy: {
      test: {
        files: [
          {
            expand: true,
            cwd: 'test/qunit/',
            src: ['qunit.html', 'qunit-tests.js'],
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
          }
        },
        files: {
          'dist/stream-file.es2015.js': ['src/stream-file.js']
        }
      },
      polyfill: {
        files: {
          'dist/es6-promise.js': ['src/es6-promise.js']
        }
      }
    },
    babel: {
      options: {
          sourceMap: true,
          presets: ['es2015']
      },
      dist: {
        files: {
          'dist/stream-file.js': 'dist/stream-file.es2015.js'
        }
      }
    },
    uglify: {
      dist: {
        options: {
          sourceMap: true,
          sourceMapIn: 'dist/stream-file.js.map'
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
    'copy',
    'browserify',
    'babel',
    'uglify',
    'compress'
  ]);

};

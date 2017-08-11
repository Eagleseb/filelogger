/*!
 * fileLogger
 * Copyright 2016 Peter Bakondy https://github.com/pbakondy
 * See LICENSE in this repository for license information
 */
(function(){
/* global angular, cordova */

// install    : cordova plugin add cordova-plugin-file

angular.module('fileLogger', ['ngCordova.plugins.file'])

  .factory('$fileLogger', ['$q', '$window', '$cordovaFile', '$timeout',
    function ($q, $window, $cordovaFile, $timeout) {

      'use strict';


      var queue = [];
      var ongoing = false;

      var logDir = 'logs/';
      var storageFilename = 'messages.log';
      // log rotate every 1 MB
      var maxSizeBeforeLogrotate = 1024 * 1024 * 1;

      // detecting Ripple Emulator
      // https://gist.github.com/triceam/4658021
      function isRipple() {
        return $window.parent && $window.parent.ripple;
      }

      function isBrowser() {
        return (!$window.cordova && !$window.PhoneGap && !$window.phonegap) || isRipple();
      }

      function getUUID() {
        return Date.now();
      }


      function logEvent(event) {
        if (!event) {
          return;
        }

        event.timestamp = new Date().toISOString();
        queue.push({ message: JSON.stringify(event) + ',\n' });

        if (!ongoing) {
          return process();
        }
      }

      function process() {

        if (!queue.length) {
          ongoing = false;
          return;
        }

        ongoing = true;
        var m = queue.shift();

        return writeLog(m.message).then(
          function () {
            $timeout(function () {
              return process();
            });
          },
          function () {
            $timeout(function () {
              return process();
            });
          }
        );

      }

      function getFileSize(fileEntry) {
        return $q(function (resolve, reject) {
          fileEntry.getMetadata(
            function (metadata) {
              resolve(metadata.size); // get file size
            }, reject);
        });
      }

      function writeLog(message) {

        if (isBrowser()) {
          // running in browser with 'ionic serve'

          if (!$window.localStorage[storageFilename]) {
            $window.localStorage[storageFilename] = '';
          }

          $window.localStorage[storageFilename] += message;
          return $q.when();

        } else {

          if (!$window.cordova || !$window.cordova.file || !$window.cordova.file.dataDirectory) {
            return $q.reject('cordova.file.dataDirectory is not available');
          }

          // First we check if logDir exists, if not we create it
          var createDir = $cordovaFile.checkDir(cordova.file.dataDirectory, logDir).catch(function () {
            return $cordovaFile.createDir(cordova.file.dataDirectory, logDir);
          });

          return createDir.then(function () {
            // Then we check if logFile exists
            $cordovaFile.checkFile(cordova.file.dataDirectory, logDir + storageFilename).then(
              function (fileEntry) {
                // If it exists and is already big, then we logrotate
                // i.e. we archive it and write logs to a fresh file
                return getFileSize(fileEntry).then(function (fileSize) {
                  if (fileSize > maxSizeBeforeLogrotate) {
                    return $cordovaFile.moveFile(cordova.file.dataDirectory, logDir + storageFilename,
                      cordova.file.dataDirectory, logDir + getUUID() + '_' + storageFilename)
                      .then(function () {
                        // writeFile(path, fileName, text, replaceBool)
                        return $cordovaFile.writeFile(cordova.file.dataDirectory, logDir + storageFilename, message, true);
                      });
                  } else {
                    // else we append log to the previous logfile
                    return $cordovaFile.writeExistingFile(cordova.file.dataDirectory, logDir + storageFilename, message);
                  }
                });
              }).catch(function () {
                // If it does not exist, we create a new file and log into it.
                // writeFile(path, fileName, text, replaceBool)
                return $cordovaFile.writeFile(cordova.file.dataDirectory, logDir + storageFilename, message, true);
              });
          });

        }

      }

      function getLogfiles() {
        if (isBrowser()) {
          var current = 0;

          var hasNext = function () {
            return current === 0;
          };

          var next = function () {
            if (hasNext()) {
              current++;
              return $q.resolve({
                path: storageFilename,
                content: $window.localStorage[storageFilename]
              });
            } else {
              $q.reject('Empty cursor');
            }
          };

          return $q.when({
            hasNext: hasNext,
            next: next
          });
        } else {
          if (!$window.cordova || !$window.cordova.file || !$window.cordova.file.dataDirectory) {
            return $q.reject('cordova.file.dataDirectory is not available');
          }

          return $q(function (resolve, reject) {
            $cordovaFile.checkDir(cordova.file.dataDirectory, logDir)
              .then(function (dirEntry) {
                var reader = dirEntry.createReader();
                reader.readEntries(resolve, reject);
              }, reject);
          }).then(function (entries) {
            var current = 0;

            var hasNext = function () {
              return current < entries.length;
            };

            var next = function () {
              var entry = entries[current];
              current++;
              if (entry.isFile) {
                return $cordovaFile.readAsText(cordova.file.dataDirectory, logDir + entry.name).then(function (content) {
                  return {
                    path: logDir + entry.name,
                    content: content
                  };
                });
              } else {
                return $q.when();
              }
            };

            return {
              hasNext: hasNext,
              next: next
            };
          });
        }
      }

      function deleteLogfile(filePath) {
        if (isBrowser()) {
          $window.localStorage.removeItem(filePath);
          return $q.when();
        } else {

          if (!$window.cordova || !$window.cordova.file || !$window.cordova.file.dataDirectory) {
            return $q.reject('cordova.file.dataDirectory is not available');
          }

          return $cordovaFile.removeFile(cordova.file.dataDirectory, filePath);
        }
      }

      function setLogDir(dirname) {
        if (angular.isString(dirname) && dirname.length > 0) {
          logDir = dirname;
          return true;
        } else {
          return false;
        }
      }

      function setStorageFilename(filename) {
        if (angular.isString(filename) && filename.length > 0) {
          storageFilename = filename;
          return true;
        } else {
          return false;
        }
      }

      function setmaxSizeBeforeLogrotate(maxSize) {
        if (angular.isNumber(maxSize) && maxSize > 0) {
          maxSizeBeforeLogrotate = maxSize;
          return true;
        } else {
          return false;
        }
      }

      function checkFile() {
        var q = $q.defer();

        if (isBrowser()) {

          q.resolve({
            'name': storageFilename,
            'localURL': 'localStorage://localhost/' + storageFilename,
            'type': 'text/plain',
            'size': ($window.localStorage[storageFilename] ? $window.localStorage[storageFilename].length : 0)
          });

        } else {

          if (!$window.cordova || !$window.cordova.file || !$window.cordova.file.dataDirectory) {
            q.reject('cordova.file.dataDirectory is not available');
            return q.promise;
          }

          $cordovaFile.checkFile(cordova.file.dataDirectory, storageFilename).then(function (fileEntry) {
            fileEntry.file(q.resolve, q.reject);
          }, q.reject);

        }

        return q.promise;
      }

      return {
        logEvent: logEvent,
        getLogfiles: getLogfiles,
        deleteLogfile: deleteLogfile,
        setStorageFilename: setStorageFilename,
        setLogDir: setLogDir,
        setmaxSizeBeforeLogrotate: setmaxSizeBeforeLogrotate,
        checkFile: checkFile,
      };

    }]);

})();
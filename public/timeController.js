define(function (require) {
  var moment = require('moment');
  var dateMath = require('ui/utils/dateMath');
  var module = require('ui/modules').get('kibana/kibana-time-plugin', ['kibana', 'BootstrapAddons']);
  var _ = require('lodash');
  require('ui/timepicker/quick_ranges');
  require('ui/timepicker/time_units');
  
  module.controller('KbnTimeVisController', function (quickRanges, timeUnits, $scope, $rootScope, Private, $filter, $timeout) {
    $rootScope.plugin = {
      timePlugin: {}
    };
    $scope.config = {
        title: ""
    };

    $rootScope.$watchMulti([
      '$$timefilter.time.from',
      '$$timefilter.time.to'
    ], setTime);

    var changeVisOff = $rootScope.$on('change:vis', function () {
      $scope.$broadcast('timesliderForceRender');
      //_.debounce(resize, 250);
    });
    $scope.$on('$destroy', function() {
      changeVisOff();
    });

    var expectedFrom = moment();
    var expectedTo = moment();
    $scope.quickLists = quickRanges;
    $scope.units = timeUnits;
    $scope.relativeOptions = [
      {text: 'Seconds ago', value: 's'},
      {text: 'Minutes ago', value: 'm'},
      {text: 'Hours ago', value: 'h'},
      {text: 'Days ago', value: 'd'},
      {text: 'Weeks ago', value: 'w'},
      {text: 'Months ago', value: 'M'},
      {text: 'Years ago', value: 'y'},
    ];
    $scope.relative = {
      count: 1,
      unit: 'm',
      preview: undefined,
      round: false
    };
    $scope.time = {
      from: moment(),
      to: moment()
    };

    //When timeslider carousel slide is not displayed, it has a width of 0
    //attach click handler to carousel controls to redraw
    $timeout(function() {
      var elems = document.getElementsByClassName('carousel-control');
      for (var i=0; i<elems.length; i++) {
        elems[i].onclick = function() {
          updateTimeslider();
        }
      }
      var elems = document.querySelectorAll('.carousel-indicators li');
      for (var i=0; i<elems.length; i++) {
        elems[i].onclick = function() {
          updateTimeslider();
        }
      }
    }, 0);

    function setTime(rangeA) {
      var from = rangeA[0];
      var to = rangeA[1];
      var ours_ms = {
        from: dateMath.parse(expectedFrom).toDate().getTime(),
        to: dateMath.parse(expectedTo, true).toDate().getTime()
      }
      var theirs_ms = {
        from: dateMath.parse(from).toDate().getTime(),
        to: dateMath.parse(to).toDate().getTime()
      }
      console.log("from, ours: " + ours_ms.from + ", theirs: " + theirs_ms.from);
      console.log("to, ours: " + ours_ms.to + ", theirs: " + theirs_ms.to);
      
      //setTime is called from watching kibana's timefilter
      //Avoid updating our $scope if the timefilter change is triggered by us
      if(Math.abs(ours_ms.from - theirs_ms.from) > 500
        || Math.abs(ours_ms.to - theirs_ms.to) > 500) {
        console.log("updating KbnTimeVisController.$scope stay in sync with kibana timefilter");
        //clean up old selections
        $scope.activeSlide = {
          absolute: false,
          quick: false,
          relative: false
        };

        //set new selections based on new time
        $scope.time = {
          from: from,
          to: to,
          absolute_from: dateMath.parse(from),
          absolute_to: dateMath.parse(to, true)
        }
        setRelativeParts(to, from);
        if('quick' === $rootScope.$$timefilter.time.mode) {
          $scope.activeSlide.quick = true;
          for(var i=0; i<quickRanges.length; i++) {
            if(quickRanges[i].from === from && quickRanges[i].to === to) {
              $scope.selectedQuick = quickRanges[i];
              $scope.time.title = quickRanges[i].display;
              break;
            }
          }
        } else if ('relative' === $rootScope.$$timefilter.time.mode) {
          $scope.activeSlide.relative = true;
          $scope.time.title = "";
        } else {
          $scope.activeSlide.absolute = true;
          $scope.time.title = "";
        }
        updateTimeslider();
      }
    }
    setTime([
      $rootScope.$$timefilter.time.from, 
      $rootScope.$$timefilter.time.to]);

    $scope.filterByTime = function(start, end) {
      console.log("timeslider - Filtering by time");
      $scope.time.mode = 'absolute';
      expectedFrom = moment(start);
      expectedTo = moment(end);
      updateKbnTime();
    }

    $scope.removeTimeFilter = function() {
      console.log("timeslider - removing time filter");
      expectedFrom = $scope.time.from;
      expectedTo = $scope.time.to;
      updateKbnTime();
    }

    $scope.setAbsolute = function() {
      $scope.time.mode = 'absolute';
      $scope.time.from = $scope.time.absolute_from;
      $scope.time.to = $scope.time.absolute_to;
      expectedFrom = $scope.time.from;
      expectedTo = $scope.time.to;
      updateKbnTime();
    };

    $scope.setRelative = function () {
      $scope.time.title = 'relative title';
      $scope.time.from = getRelativeString();
      $scope.time.to = 'now';
      $scope.time.mode = 'relative';
      expectedFrom = $scope.time.from;
      expectedTo = $scope.time.to;
      updateKbnTime();
    };

    $scope.setQuick = function (selectedQuick) {
      $scope.time.title = selectedQuick.display;
      $scope.time.from = selectedQuick.from;
      $scope.time.to = selectedQuick.to;
      $scope.time.mode = 'quick';
      expectedFrom = $scope.time.from;
      expectedTo = $scope.time.to, true;
      updateKbnTime();
    };

    function updateKbnTime() {
      $rootScope.$$timefilter.time.from = expectedFrom;
      $rootScope.$$timefilter.time.to = expectedTo;
      $rootScope.$$timefilter.time.mode = $scope.time.mode;
      console.log("updated kibana mode to " + $scope.time.mode);
      $timeout(function() {
        console.log("double check mode: " + $scope.time.mode);
      }, 0);
      
      //keep other carousel slides in sync with new values
      if($scope.time.mode !== 'absolute') {
        $scope.time.absolute_from = dateMath.parse($scope.time.from);
        $scope.time.absolute_to = dateMath.parse($scope.time.to, true);
      }
      if($scope.time.mode !== 'relative') {
        //wrapped in $timeout to avoid calling $apply while all ready in progress
        $timeout(setRelativeParts($scope.time.to, $scope.time.from), 0);
      }
      updateTimeslider();
    }

    function updateTimeslider() {
      $timeout(function() {
        $scope.$broadcast('timesliderForceRender');
      }, 0);
    }

    $scope.$watch('vis.params.title', function (title) {
      $scope.config.title = title;
    });

    //Relative date logic copied from https://github.com/elastic/kibana/blob/4.4/src/ui/public/timepicker/timepicker.js

    //convert to and from into pieces needed for relative inputs
    function setRelativeParts(to, from) {
      var fromParts = from.toString().split('-');
      var relativeParts = [];

      // Try to parse the relative time, if we can't use moment duration to guestimate
      if (to.toString() === 'now' && fromParts[0] === 'now' && fromParts[1]) {
        relativeParts = fromParts[1].match(/([0-9]+)([smhdwMy]).*/);
      }
      if (relativeParts[1] && relativeParts[2]) {
        $scope.relative.count = parseInt(relativeParts[1], 10);
        $scope.relative.unit = relativeParts[2];
      } else {
        var duration = moment.duration(moment().diff(dateMath.parse(from)));
        var units = _.pluck(_.clone($scope.relativeOptions).reverse(), 'value');
        if (from.toString().split('/')[1]) $scope.relative.round = true;
        for (var i = 0; i < units.length; i++) {
          var as = duration.as(units[i]);
          if (as > 1) {
            $scope.relative.count = Math.round(as);
            $scope.relative.unit = units[i];
            break;
          }
        }
      }

      if (from.toString().split('/')[1]) $scope.relative.round = true;
      formatRelative();
    }
    function formatRelative() {
      var parsed = dateMath.parse(getRelativeString());
      $scope.relative.preview =  parsed ? parsed.format($scope.format) : undefined;
      return parsed;
    }
    $scope.formatRelative = formatRelative;

    function getRelativeString() {
      return 'now-' + $scope.relative.count + $scope.relative.unit + ($scope.relative.round ? '/' + $scope.relative.unit : '');
    }
  });
});

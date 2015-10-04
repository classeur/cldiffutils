var childProcess = require('child_process');
var gulp = require('gulp');
var bump = require('gulp-bump');
var util = require('gulp-util');

gulp.task('patch', bumpTask('patch'));
gulp.task('minor', bumpTask('minor'));
gulp.task('major', bumpTask('major'));

gulp.task('tag', function(cb) {
    var version = require('./package.json').version;
    var tag = 'v' + version;
    util.log('Tagging as: ' + util.colors.cyan(tag));
    exec([
        'git add package.json',
        'git commit -m "Prepare release"',
        'git tag -a ' + tag + ' -m "Version ' + version + '"',
        'git push origin master --tags',
        'npm publish',
    ], cb);
});

function bumpTask(importance) {
	return function() {
		return gulp.src([
				'./package.json'
			])
			.pipe(bump({
				type: importance
			}))
			.pipe(gulp.dest('./'));
	};
}

function exec(cmds, cb) {
    cmds.length === 0 ? cb() : childProcess.exec(cmds.shift(), {
        cwd: process.cwd()
    }, function(err, stdout, stderr) {
        if (err) {
            return cb(err);
        }
        util.log(stdout, stderr);
        exec(cmds, cb);
    });
}

const { src, dest } = require('gulp');

function copyIcons() {
	const nodeSource = 'nodes/**/*.{png,svg}';
	const nodeDestination = 'dist/nodes';

	src(nodeSource).pipe(dest(nodeDestination));

	const credSource = 'credentials/**/*.{png,svg}';
	const credDestination = 'dist/credentials';

	return src(credSource).pipe(dest(credDestination));
}

exports['build:icons'] = copyIcons;

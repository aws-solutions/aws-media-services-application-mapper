#!/bin/bash
#
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned
#
# This script should be run from the repo's deployment directory
# cd deployment
# ./build-s3-dist.sh source-bucket-base-name solution-name version-code
#
# Paramenters:
#  - source-bucket-base-name: Name for the S3 bucket location where the template will source the Lambda
#    code from. The template will append '-[region_name]' to this bucket name.
#    For example: ./build-s3-dist.sh solutions v1.0.0
#    The template will then expect the source code to be located in the solutions-[region_name] bucket
#
#  - solution-name: name of the solution for consistency
#
#  - version-code: version of the package

set -euo pipefail

# only option h is allowed to display help message
while getopts ':h' OPTION; do
  case "$OPTION" in
    h)
      echo
      echo "script usage: $(basename $0) DIST_OUTPUT_BUCKET SOLUTION_NAME VERSION"
      echo "example usage: ./$(basename $0) mybucket aws-media-services-application-mapper v1.8.0"
      echo
      echo "If no arguments are passed in, the following default values are used:"
      echo "DIST_OUTPUT_BUCKET=rodeolabz"
      echo "SOLUTION_NAME=aws-media-services-application-mapper"
      echo "VERSION=v1.0.0"
      echo
      echo "You may export these variables in your environment and call the script using those variables:"
      echo "./$(basename $0) \$DIST_OUTPUT_BUCKET \$SOLUTION_NAME \$VERSION"
      echo 
      exit 1
      ;;
    ?)
      echo "script usage: $(basename $0) DIST_OUTPUT_BUCKET SOLUTION_NAME VERSION"
      exit 1
      ;;
  esac
done

ORIGIN=`pwd`
DIST_OUTPUT_BUCKET="$1" 
SOLUTION_NAME="$2"
VERSION="$3"

# Set defaults if variables are not set:
if [ -z "$1" ]
  then
    echo "Setting default base source bucket name to rodeolabz."
    DIST_OUTPUT_BUCKET='rodeolabz'
fi
if [ -z "$2" ] 
  then
    echo "Setting default solution name to media-service-application-mapper."
    SOLUTION_NAME='aws-media-service-application-mapper'
fi

if [ -z "$3" ]
  then
    echo "Setting default version to v1.0.0"
    VERSION='v1.0.0'
fi

template_dir="$PWD" # /deployment
template_dist_dir="$template_dir/global-s3-assets"
build_dist_dir="$template_dir/regional-s3-assets"
source_dir="$template_dir/../source"
msam_core_dist_dir="$source_dir/cdk/dist"

echo "------------------------------------------------------------------------------"
echo "[Init] Clean old dist, node_modules and bower_components folders"
echo "------------------------------------------------------------------------------"

# <root_dir>/deployment/global-s3-assets
echo "rm -rf $template_dist_dir"
rm -rf $template_dist_dir
echo "mkdir -p $template_dist_dir"
mkdir -p $template_dist_dir

# <root_dir>/deployment/regional-s3-assets
echo "rm -rf $build_dist_dir"
rm -rf $build_dist_dir
echo "mkdir -p $build_dist_dir"
mkdir -p $build_dist_dir

# <root_dir>/source/cdk/dist
echo "rm -rf $msam_core_dist_dir"
rm -rf "$msam_core_dist_dir"
echo "mkdir -p $msam_core_dist_dir"
mkdir -p "$msam_core_dist_dir"

# date stamp for this build
STAMP=`date +%s`
echo build stamp is $STAMP

# move to the source dir first
cd $source_dir
# MSAM core template
echo
echo ------------------------------------
echo MSAM Core Template
echo ------------------------------------
echo

cd msam
chalice package $msam_core_dist_dir
if [ $? -ne 0 ]; then
  echo "ERROR: running chalice package"
  exit 1
fi
cd $msam_core_dist_dir
# mv zip file to regional asset dir
mv deployment.zip $build_dist_dir/core_$STAMP.zip
# rename sam.json
mv sam.json msam-core-release.template

# MSAM event collector template
echo
echo ------------------------------------
echo Event Collector Template
echo ------------------------------------
echo

EVENTS_ZIP="events.zip"
cd $source_dir/events
# clear the package directory
rm -rf ./package
# install all the requirements into package dir
pip install --upgrade --force-reinstall --target ./package -r requirements.txt 2> error.txt
if [ $? -ne 0 ]; then
  echo "ERROR: Event collector package installation failed."
  cat error.txt
  rm error.txt
  exit 1
fi

cd package
zip -r9 ../$EVENTS_ZIP .
cd ../
zip -g9 $EVENTS_ZIP cloudwatch_alarm.py media_events.py
mv $EVENTS_ZIP $build_dist_dir/events_$STAMP.zip

# MSAM database custom resource
echo
echo ------------------------------------
echo Settings default custom resource
echo ------------------------------------
echo

cd $source_dir/msam/db
./makezip.sh
if [ $? -ne 0 ]; then
  echo "ERROR: Packaging up DB files."
  exit 1
fi
mv dynamodb_resource.zip $build_dist_dir/dynamodb_resource_$STAMP.zip

echo
echo ------------------------------------
echo Web application
echo ------------------------------------
echo

# update web module dependencies
cd $source_dir/html
rm -rf node_modules
npm install

# determine what we need to keep in node_modules
echo thinning browser application dependencies
KEEPDEPS=$(mktemp /tmp/keepdeps.XXXXXX)
echo dependencies to keep are stored in $KEEPDEPS
# extract the JavaScript content in use
grep -o -e 'node_modules/[^\"]*\.js' index.html >$KEEPDEPS
# keep all the .css related files
find node_modules -type f -name '*.css' -print >>$KEEPDEPS
find node_modules -type f -name '*.woff*' -print >>$KEEPDEPS
# remove everything else
$template_dir/reduce_contents.py --file $KEEPDEPS --folder node_modules --execute
# prune empty folders
find node_modules -type d -empty -delete

# add build stamp
cd $source_dir/html
echo "updating browser app build stamp"
cp -f js/app/build-tmp.js js/app/build.js
sed -i -e "s/VERSION/$VERSION/g" js/app/build.js
zip -q -r -9 $build_dist_dir/msam-web-$STAMP.zip * -x package.json package-lock.json
rm -f js/app/build.js-e

# create a digest for the web content
SHATEXT="`shasum $build_dist_dir/msam-web-$STAMP.zip | awk '{ print $1 }'`"
echo web content archive SHA1 is $SHATEXT

# update webcontent_resource.zip 
cd $source_dir/web-cloudformation
cp $build_dist_dir/msam-web-$STAMP.zip .
./makezip.sh msam-web-$STAMP.zip
if [ $? -ne 0 ]; then
  echo "ERROR: Packaging up web files."
  exit 1
fi
mv webcontent_resource.zip $build_dist_dir/webcontent_resource_$STAMP.zip

echo
echo ------------------------------------
echo Synthesize CDK
echo ------------------------------------
echo

# install npm package dependencies
cd $source_dir/cdk

echo "cdk synth"
npm run synth

# remove all output except cfn template files
echo "removing unnecessary cdk output files..."
cd cdk.out
rm manifest.json tree.json *.assets.json

# rename and copy output root cfn template to <root_dir>/deployment/global-s3-assets
echo "renaming and moving root cfn template to deployment/global-s3-assets..."
mv \
  MediaServicesApplicationMapper.template.json \
  "${template_dist_dir}/aws-media-services-application-mapper-release.template"

# rename and copy output nested cfn templates to <root_dir>/deployment/global-s3-assets
echo "renaming and moving nested cfn templates to deployment/global-s3-assets..."
declare -ar nested_stacks_names_src=( \
  BrowserAppModuleStack \
  CoreModuleStack \
  DynamoDBModuleStack \
  EventsModuleStack \
  IAMModuleStack \
)
declare -ar nested_stacks_names_dst=( \
  browser-app \
  core \
  dynamodb \
  events \
  iam-roles \
)

for i in `seq 0 $((${#nested_stacks_names_src[@]} - 1))`; do
  mv \
    *${nested_stacks_names_src[$i]}????????.nested.template.json \
    "${template_dist_dir}/msam-${nested_stacks_names_dst[$i]}-release.template"
done

# run cdk solution helper
echo "running deployment/cdk-solution-helper/index.js..."
cd $template_dir/cdk-solution-helper
node index.js

# update symbols in templates
echo "updating template symbols"
cd $template_dist_dir
TEMPLATES=`find . -name '*.template' -type f `

echo $TEMPLATES | \
    xargs -n 1 sed -i -e "s/DEV_0_0_0/$STAMP/g"

echo $TEMPLATES | \
    xargs -n 1 sed -i -e "s/%%BUCKET_NAME%%/$DIST_OUTPUT_BUCKET/g"

echo $TEMPLATES | \
    xargs -n 1 sed -i -e "s/%%SOLUTION_NAME%%/$SOLUTION_NAME/g"

echo $TEMPLATES | \
    xargs -n 1 sed -i -e "s/%%VERSION%%/$VERSION/g"

echo $TEMPLATES | \
    xargs -n 1 sed -i -e "s/ZIP_DIGEST_VALUE/$SHATEXT/g"

echo $TEMPLATES | \
    xargs -n 1 sed -i -e "s/CUSTOM_RESOURCE_FILE/webcontent_resource_$STAMP.zip/g"

# clean up
rm -f $template_dist_dir/*.template-e

# copy all processed templates to the regional assets directory
cp *.template $build_dist_dir

echo
echo ------------------------------------
echo Finished
echo ------------------------------------
echo

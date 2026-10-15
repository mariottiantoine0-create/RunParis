#!/bin/bash
# usage: excl.sh <ville>   (dans /home/claude/villes/<ville>)
set -e
C=$1; D=/home/claude/villes/$C; X=$D/excl
read S Wb N Eb < <(python3 -c "import json;b=json.load(open('$D/$C.json'))['bbox'];print(b[0],b[2],b[1],b[3])")
cd $X
sed -i "s#^PBF=.*#PBF='/home/claude/villes/raw/$C.osm.pbf'#; s#^S,Wb,N,Eb=.*#S,Wb,N,Eb=$S,$Wb,$N,$Eb#" *.py
sed -i "s#/home/claude/lyon/pipe/work/#$D/work/#g" *.js
python3 private_scan.py && node private_match.js
cp private.txt $D/work/private.txt; cp private.txt $D/work/pub/private.txt
python3 excl_scan.py && python3 excl_select.py && node excl_match.js
python3 excl_malls.py && node excl_mallmatch.js && node excl_final.js
cp excl_final.txt $D/work/pub/excl.txt

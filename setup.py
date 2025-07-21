#!/usr/bin/env python
"""Setup script for hyphy-mcp."""

import os
from setuptools import setup

# Read the version from version.py without importing the package
__version__ = None
with open(os.path.join("hyphy-mcp", "version.py"), "r") as f:
    for line in f:
        if line.startswith("__version__"):
            exec(line)
            break

if __version__ is None:
    raise RuntimeError("Unable to find version string.")

# Read the long description from README.md
with open("README.md", "r") as f:
    long_description = f.read()

setup(
    name="hyphy-mcp",
    version=__version__,
    packages=["hyphy_mcp"],
    package_dir={"hyphy_mcp": "hyphy-mcp"},
    description="Model Context Protocol server for HyPhy evolutionary analysis",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Danielle Callan",
    author_email="dcallan@temple.edu",
    url="https://github.com/d-callan/hyphy-mcp",
    python_requires=">=3.10",
    install_requires=[
        "biopython>=1.83",
        "mcp[cli]>=1.9.4",
    ],
    entry_points={
        "console_scripts": [
            "hyphy-mcp=hyphy_mcp.__main__:run",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.12",
        "Topic :: Scientific/Engineering :: Bio-Informatics",
    ],
    keywords="hyphy, phylogenetics, bioinformatics, mcp",
)

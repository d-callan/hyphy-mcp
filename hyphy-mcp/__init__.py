"""
HyPhy MCP - Model Context Protocol server for HyPhy evolutionary analysis.
"""

from .version import __version__
from . import server
from .server import (
    mcp,
    get_available_methods,
    upload_file_to_datamonkey,
    start_busted_job,
    start_fel_job,
    start_meme_job,
    start_absrel_job,
    start_bgm_job,
    start_contrast_fel_job,
    start_fade_job,
    start_fubar_job,
    start_gard_job,
    start_multihit_job,
    start_nrm_job,
    start_relax_job,
    start_slac_job,
    start_slatkin_job,
    check_datamonkey_job_status,
    fetch_datamonkey_job_results
)

__all__ = [
    "__version__", 
    "server", 
    "mcp",
    "get_available_methods",
    "upload_file_to_datamonkey",
    "start_busted_job",
    "start_fel_job",
    "start_meme_job",
    "start_absrel_job",
    "start_bgm_job",
    "start_contrast_fel_job",
    "start_fade_job",
    "start_fubar_job",
    "start_gard_job",
    "start_multihit_job",
    "start_nrm_job",
    "start_relax_job",
    "start_slac_job",
    "start_slatkin_job",
    "check_datamonkey_job_status",
    "fetch_datamonkey_job_results"
]

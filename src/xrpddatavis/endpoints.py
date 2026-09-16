HEALTH_ROUTE = "/healthz"
INFO = "/info"  # GET static app metadata (e.g. beamline) for the UI title bar

# --- data in -----------------------------------------------------------------
PLOT = "/plot"  # POST a DataPlot (or FittedDataPlot) document

# --- data out ----------------------------------------------------------------
LIVEPLOTS = "/liveplots"  # GET metadata for every live plot
PLOT_DATA = "/plot/{id}"  # GET the arrays for one plot
EVENTS = "/events"  # GET a server-sent event stream of store changes
LIMITS = "/limits"  # GET max_plots / ttl_seconds

# --- mutate ------------------------------------------------------------------
REMOVE_PLOT = "/remove/{id}"  # DELETE one plot
EDIT_PLOT = "/edit/{id}"  # PATCH name / plot_type / colour
CLEAR_PLOTS = "/plots"  # DELETE every plot

# --- frontend ----------------------------------------------------------------
UI = "/"
STATIC = "/static"

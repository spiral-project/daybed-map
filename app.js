window.Daybed.SETTINGS.SERVER = 'https://daybed.lolnet.org';

window.Daybed.SETTINGS.TILES = (window.Daybed.SETTINGS.TILES || "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");

window.Daybed.SETTINGS.STYLES = L.Util.extend((window.Daybed.SETTINGS.STYLES || {}), {
    'default': {color: 'green', fillColor: 'green', opacity: 0.5},
    'highlight': {color: 'yellow', fillColor: 'yellow', opacity: 1.0}
});


var DaybedMapApp = Backbone.Router.extend({

    routes: {
        "":                    "home",
        ":modelname/create":   "create",
        ":modelname":          "list"
    },

    initialize: function () {
        this.definition = null;
    },

    home: function() {
        $("#content").html(new HomeView().render().el);
    },

    create: function(modelname) {
        $("#content").html(new DefinitionCreate({modelname: modelname}).render().el);
    },

    list: function(modelname) {
        // If no definition loaded or model changed, fetch from server !
        if (!this.definition || this.definition.modelname != modelname) {
            this.definition = new MapModel({id: modelname});

            // Redirect to creation page if unknown
            var createIfMissing = function (model, xhr) {
                if (xhr.status == 404) {
                    app.navigate(modelname + '/create', {trigger:true});
                }
            };
            this.definition.fetch({error: createIfMissing});
        }
        this.definition.whenReady((function () {
            var view = new ListView(this.definition);
            $("#content").html(view.el);  // Leaflet needs its container in DOM
            view.render();
        }).bind(this));
    }
});

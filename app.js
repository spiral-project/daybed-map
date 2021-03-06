window.Daybed.SETTINGS.SERVER = 'https://daybed.io/v1';

window.Daybed.SETTINGS.TILES = (window.Daybed.SETTINGS.TILES || "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");

window.Daybed.SETTINGS.PREFIX = 'daybed:map:';

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

            if (modelname.indexOf(window.Daybed.SETTINGS.PREFIX) !== 0) {
                modelname = window.Daybed.SETTINGS.PREFIX + modelname;
            }

            this.definition = new MapModel({id: modelname});

            // Redirect to creation page if unknown
            var createIfMissing = function (model, xhr) {
                var destination = modelname + '/create';
                if (xhr.status == 401 || xhr.status == 403) {
                    destination = '';  // exists but can't read
                }
                return app.navigate(destination, {trigger:true});
            };
            this.definition.fetch({error: createIfMissing});
        }
        this.definition.whenReady((function () {
            var view = new MainView(this.definition);
            $("#content").html(view.render().el);
        }).bind(this));
    }
});
